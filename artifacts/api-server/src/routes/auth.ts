import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { users, otpCodes, wallets } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod";
import { signJwt, verifyJwt, extractToken, type JwtPayload } from "../lib/jwt";
import { logger } from "../lib/logger";
import { sendOtp } from "../lib/sms";
import rateLimit from "express-rate-limit";

const router: IRouter = Router();

// ── Rate limiters ────────────────────────────────────────────────────────────

/**
 * OTP request limiter — 5 requests per phone per 10 minutes.
 * Protects Africa's Talking SMS bill from abuse.
 */
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  keyGenerator: (req) => {
    // Key by phone number so limits are per-user, not per-IP
    const phone = req.body?.phone ?? req.ip ?? "unknown";
    return String(phone).replace(/\D/g, "").slice(-9); // last 9 digits
  },
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many OTP requests. Please wait 10 minutes before trying again." });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General auth limiter — 20 requests per IP per 15 minutes.
 * Covers verify-otp brute force attempts.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many requests. Please slow down." });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const PhoneSchema = z.string().regex(/^(07|01|2547|2541)\d{8}$/, "Invalid Kenyan phone number");
const OtpSchema   = z.string().length(6).regex(/^\d+$/, "OTP must be 6 digits");

function normalizePhone(phone: string): string {
  if (phone.startsWith("07") || phone.startsWith("01")) return "254" + phone.slice(1);
  return phone;
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function dispatchOtp(phone: string, otp: string, context: string): Promise<void> {
  const smsResult = await sendOtp(phone, otp);
  if (smsResult.success) {
    logger.info({ phone, context }, "OTP sent via Africa's Talking SMS");
  } else {
    logger.warn({ phone, otp, context, error: smsResult.error }, "SMS delivery failed — OTP logged for dev");
  }
}

const RegisterSchema = z.object({
  phone:    PhoneSchema,
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, "Username: letters, digits, underscores only"),
});

router.post("/register", otpLimiter, async (req: Request, res: Response) => {
  const body = RegisterSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const phone = normalizePhone(body.data.phone);
  const { username } = body.data;

  const existing = await db.select({ id: users.id }).from(users)
    .where(eq(users.phone, phone));
  if (existing.length > 0) {
    res.status(409).json({ error: "Phone number already registered" });
    return;
  }

  const existingUsername = await db.select({ id: users.id }).from(users)
    .where(eq(users.username, username));
  if (existingUsername.length > 0) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const otp       = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(otpCodes).values({ phone, code: otp, expiresAt });

  await dispatchOtp(phone, otp, "register");

  const pendingData = { phone, username };
  (req as any).app.locals.pendingRegistrations = (req as any).app.locals.pendingRegistrations ?? {};
  (req as any).app.locals.pendingRegistrations[phone] = pendingData;

  res.json({
    message: "OTP sent to your phone. Valid for 10 minutes.",
    phone,
  });
});

const VerifyOtpSchema = z.object({
  phone:    PhoneSchema,
  otp:      OtpSchema,
  username: z.string().min(3).max(32).optional(),
});

router.post("/verify-otp", authLimiter, async (req: Request, res: Response) => {
  const body = VerifyOtpSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const phone = normalizePhone(body.data.phone);

  const [record] = await db.select().from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), gt(otpCodes.expiresAt, new Date())))
    .orderBy(otpCodes.id)
    .limit(1);

  if (!record) {
    res.status(400).json({ error: "OTP not found or expired" });
    return;
  }

  if (record.attempts >= 5) {
    res.status(429).json({ error: "Too many OTP attempts. Request a new code." });
    return;
  }

  if (record.code !== body.data.otp) {
    await db.update(otpCodes).set({ attempts: record.attempts + 1 }).where(eq(otpCodes.id, record.id));
    const remaining = 5 - (record.attempts + 1);
    res.status(400).json({ error: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` });
    return;
  }

  await db.update(otpCodes).set({ usedAt: new Date() }).where(eq(otpCodes.id, record.id));

  let user = await db.query.users.findFirst({ where: eq(users.phone, phone) });

  if (!user) {
    const pending = (req as any).app.locals.pendingRegistrations?.[phone];
    const username = body.data.username ?? pending?.username ?? "Player" + Math.floor(Math.random() * 9999);

    [user] = await db.insert(users).values({
      phone,
      username,
      isActive: true,
    }).returning();

    await db.insert(wallets).values({ userId: user.id, balanceCents: 0 });
    logger.info({ userId: user.id, phone }, "New user registered");
  }

  const token = signJwt({
    sub: user.id,
    phone: user.phone,
    username: user.username,
    isAdmin: user.isAdmin,
  });

  res.json({ token, user: { id: user.id, phone: user.phone, username: user.username, isAdmin: user.isAdmin } });
});

const LoginSchema = z.object({
  phone: PhoneSchema,
});

router.post("/login", otpLimiter, async (req: Request, res: Response) => {
  const body = LoginSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const phone = normalizePhone(body.data.phone);

  const otp       = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(otpCodes).values({ phone, code: otp, expiresAt });

  await dispatchOtp(phone, otp, "login");

  res.json({ message: "OTP sent to your phone." });
});

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as JwtPayload;
  const [dbUser] = await db.select().from(users).where(eq(users.id, user.sub));
  if (!dbUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ id: dbUser.id, phone: dbUser.phone, username: dbUser.username, isAdmin: dbUser.isAdmin });
});

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const payload = verifyJwt(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  (req as any).user = payload;
  next();
}

export default router;
