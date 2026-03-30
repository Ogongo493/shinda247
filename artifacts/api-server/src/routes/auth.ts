import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { users, otpCodes, wallets } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod";
import { signJwt, verifyJwt, extractToken, type JwtPayload } from "../lib/jwt";
import { logger } from "../lib/logger";
import { adminAuth } from "../lib/firebase-admin";

const router: IRouter = Router();

const PhoneSchema = z.string().regex(/^(07|01|2547|2541)\d{8}$/, "Invalid Kenyan phone number");
const OtpSchema   = z.string().length(6).regex(/^\d+$/, "OTP must be 6 digits");

function normalizePhone(phone: string): string {
  if (phone.startsWith("07") || phone.startsWith("01")) return "254" + phone.slice(1);
  return phone;
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashPassword(pwd: string): string {
  return crypto.createHash("sha256").update(pwd + "shinda247salt").digest("hex");
}

const RegisterSchema = z.object({
  phone:    PhoneSchema,
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, "Username: letters, digits, underscores only"),
});

router.post("/register", async (req: Request, res: Response) => {
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

  const otp      = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(otpCodes).values({ phone, code: otp, expiresAt });

  logger.info({ phone, otp }, "OTP for registration (dev: logged, prod: send via SMS)");

  res.json({
    message: "OTP sent to your phone. Valid for 10 minutes.",
    phone,
  });

  const pendingData = { phone, username };
  (req as any).app.locals.pendingRegistrations = (req as any).app.locals.pendingRegistrations ?? {};
  (req as any).app.locals.pendingRegistrations[phone] = pendingData;
});

const VerifyOtpSchema = z.object({
  phone:    PhoneSchema,
  otp:      OtpSchema,
  username: z.string().min(3).max(32).optional(),
});

router.post("/verify-otp", async (req: Request, res: Response) => {
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

  if (record.attempts >= 3) {
    res.status(429).json({ error: "Too many OTP attempts. Request a new code." });
    return;
  }

  if (record.code !== body.data.otp) {
    await db.update(otpCodes).set({ attempts: record.attempts + 1 }).where(eq(otpCodes.id, record.id));
    res.status(400).json({ error: "Invalid OTP" });
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

router.post("/login", async (req: Request, res: Response) => {
  const body = LoginSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const phone = normalizePhone(body.data.phone);

  const otp       = generateOtp();
  const expiresAt  = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(otpCodes).values({ phone, code: otp, expiresAt });

  logger.info({ phone, otp }, "OTP for login (dev: logged, prod: send via SMS)");

  res.json({
    message: "OTP sent to your phone.",
  });
});

const FirebaseVerifySchema = z.object({
  idToken:  z.string().min(10),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, "Username: letters, digits, underscores only").optional(),
});

router.post("/firebase-verify", async (req: Request, res: Response) => {
  const body = FirebaseVerifySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(body.data.idToken);
  } catch {
    res.status(401).json({ error: "Invalid Firebase token" });
    return;
  }

  const rawPhone = decoded.phone_number;
  if (!rawPhone) {
    res.status(400).json({ error: "No phone number in token" });
    return;
  }

  const phone = normalizePhone(rawPhone.replace(/^\+/, ""));

  let user = await db.query.users.findFirst({ where: eq(users.phone, phone) });

  if (!user) {
    const desiredUsername = body.data.username ?? `Player${Math.floor(Math.random() * 9999)}`;

    const existingUsername = await db.select({ id: users.id }).from(users).where(eq(users.username, desiredUsername));
    const username = existingUsername.length > 0
      ? `${desiredUsername}${Math.floor(Math.random() * 999)}`
      : desiredUsername;

    [user] = await db.insert(users).values({ phone, username, isActive: true }).returning();
    await db.insert(wallets).values({ userId: user.id, balanceCents: 0 });
    logger.info({ userId: user.id, phone }, "New user registered via Firebase");
  }

  const token = signJwt({
    sub: user.id,
    phone: user.phone,
    username: user.username,
    isAdmin: user.isAdmin,
  });

  res.json({ token, user: { id: user.id, phone: user.phone, username: user.username, isAdmin: user.isAdmin } });
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
