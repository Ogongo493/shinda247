import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { users, wallets } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { signJwt, verifyJwt, extractToken, type JwtPayload } from "../lib/jwt";
import { logger } from "../lib/logger";
import rateLimit from "express-rate-limit";

const router: IRouter = Router();

// ── Rate limiters ─────────────────────────────────────────────────────────────

/** 10 login attempts per IP per 15 minutes — blocks brute force */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many login attempts. Please wait 15 minutes." });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/** 5 registrations per IP per hour — blocks account farming */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many accounts created. Please wait an hour." });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Password hashing (Node built-in scrypt — no extra packages) ───────────────

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key))
  );
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, "hex");
  const derived = await new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key))
  );
  // timing-safe comparison — prevents timing attacks
  return crypto.timingSafeEqual(hashBuf, derived);
}

// ── Validation schemas ────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username: letters, digits, and underscores only"),
  phone: z.string()
    .min(9, "Invalid phone number")
    .max(15, "Invalid phone number"),
  password: z.string()
    .min(6, "Password must be at least 6 characters")
    .max(72, "Password too long"),
});

const LoginSchema = z.object({
  phone: z.string().min(1, "Phone number is required"),
  password: z.string().min(1, "Password is required"),
});

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0"))   return "254" + digits.slice(1);
  return digits;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.post("/register", registerLimiter, async (req: Request, res: Response) => {
  const body = RegisterSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const phone    = normalizePhone(body.data.phone);
  const username = body.data.username;
  const password = body.data.password;

  // Check phone not taken
  const existingPhone = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
  if (existingPhone.length > 0) {
    res.status(409).json({ error: "Phone number already registered" });
    return;
  }

  // Check username not taken
  const existingUsername = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (existingUsername.length > 0) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db.insert(users).values({
    phone,
    username,
    passwordHash,
    isActive: true,
  }).returning();

  await db.insert(wallets).values({ userId: user.id, balanceCents: 0 });

  logger.info({ userId: user.id, phone }, "New user registered");

  const token = signJwt({
    sub:      user.id,
    phone:    user.phone,
    username: user.username,
    isAdmin:  user.isAdmin,
  });

  res.status(201).json({
    token,
    user: { id: user.id, phone: user.phone, username: user.username, isAdmin: user.isAdmin },
  });
});

router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  const body = LoginSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const phone = normalizePhone(body.data.phone);

  const [user] = await db.select().from(users).where(eq(users.phone, phone));

  // Generic error — don't reveal whether phone exists
  const INVALID = "Invalid phone number or password";

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: INVALID });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: "Account suspended. Contact support." });
    return;
  }

  const valid = await verifyPassword(body.data.password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: INVALID });
    return;
  }

  const token = signJwt({
    sub:      user.id,
    phone:    user.phone,
    username: user.username,
    isAdmin:  user.isAdmin,
  });

  res.json({
    token,
    user: { id: user.id, phone: user.phone, username: user.username, isAdmin: user.isAdmin },
  });
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
