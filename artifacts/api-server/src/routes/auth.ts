import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { users, wallets, adminSessions, adminMfaChallenges } from "@workspace/db";
import { eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { signJwt, verifyJwt, extractToken, type JwtPayload } from "../lib/jwt";
import { logger } from "../lib/logger";
import { createTotpSecret, encryptTotpSecret, decryptTotpSecret, verifyTotp, authenticatorUri } from "../lib/admin-totp";
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
  email: z.string().email("Enter a valid email address").max(254).optional(),
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
  const email = body.data.email?.trim().toLowerCase() || null;

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

  if (email) {
    const [existingEmail] = await db.select({ id: users.id }).from(users).where(ilike(users.email, email));
    if (existingEmail) {
      res.status(409).json({ error: "Email address already registered" });
      return;
    }
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db.insert(users).values({
    phone,
    username,
    passwordHash,
    email,
    isActive: true,
    isAdmin: false,
    accountType: "player",
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
    user: { id: user.id, phone: user.phone, username: user.username, email: user.email, isAdmin: user.isAdmin },
  });
});

router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  const body = LoginSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const identifier = body.data.phone.trim();
  const [user] = identifier.includes("@")
    ? await db.select().from(users).where(ilike(users.email, identifier.toLowerCase()))
    : await db.select().from(users).where(eq(users.phone, normalizePhone(identifier)));

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

  if (user.accountType === "admin") {
    try {
      if (!user.adminTotpEnabled) {
        const secret = user.adminTotpSecretEnc
          ? decryptTotpSecret(user.adminTotpSecretEnc)
          : createTotpSecret();
        if (!user.adminTotpSecretEnc) {
          await db.update(users).set({ adminTotpSecretEnc: encryptTotpSecret(secret) })
            .where(eq(users.id, user.id));
        }
        const setupToken = signJwt({
          sub: user.id, phone: user.phone, username: user.username,
          isAdmin: true, purpose: "admin_mfa_setup",
        }, 10 * 60);
        res.json({
          mfaSetupRequired: true,
          setupToken,
          authenticatorSecret: secret,
          authenticatorUri: authenticatorUri(secret, user.username),
          user: { id: user.id, username: user.username, isAdmin: true },
        });
        return;
      }
      const challengeId = crypto.randomUUID();
      const challengeToken = signJwt({
        sub: user.id, phone: user.phone, username: user.username,
        isAdmin: true, purpose: "admin_mfa_challenge", challengeId,
      }, 5 * 60);
      await db.insert(adminMfaChallenges).values({
        id: challengeId,
        userId: user.id,
        codeHash: crypto.createHash("sha256").update(challengeToken).digest("hex"),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });
      res.json({ mfaRequired: true, challengeToken });
      return;
    } catch (error) {
      logger.error({ error, userId: user.id }, "Administrator MFA setup unavailable");
      res.status(503).json({ error: "Administrator MFA is not configured on the server yet." });
      return;
    }
  }

  const token = signJwt({
    sub: user.id,
    phone: user.phone,
    username: user.username,
    isAdmin: false,
  });

  res.json({
    token,
    user: { id: user.id, phone: user.phone, username: user.username, email: user.email, isAdmin: false },
  });
});


// Administrator authenticator enrollment. The setup token is short-lived and
// cannot access the dashboard or any protected administrator API.
router.post("/admin/mfa/verify-setup", loginLimiter, async (req: Request, res: Response) => {
  const body = z.object({
    setupToken: z.string().min(1),
    code: z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Enter the six-digit authenticator code." }); return; }
  const payload = verifyJwt(body.data.setupToken);
  if (!payload || payload.purpose !== "admin_mfa_setup") {
    res.status(401).json({ error: "Administrator setup session expired. Sign in again." });
    return;
  }
  const [account] = await db.select().from(users).where(eq(users.id, payload.sub));
  if (!account || !account.isActive || account.accountType !== "admin" || account.adminTotpEnabled || !account.adminTotpSecretEnc) {
    res.status(403).json({ error: "Administrator authenticator enrollment is not available." });
    return;
  }
  try {
    const secret = decryptTotpSecret(account.adminTotpSecretEnc);
    if (!verifyTotp(secret, body.data.code)) {
      res.status(401).json({ error: "Incorrect authenticator code." });
      return;
    }
    await db.update(users).set({ adminTotpEnabled: true, updatedAt: new Date() })
      .where(eq(users.id, account.id));
    res.json({ success: true, message: "Authenticator enabled. Sign in again to complete administrator verification." });
  } catch (error) {
    logger.error({ error, userId: account.id }, "Administrator MFA enrollment verification failed");
    res.status(503).json({ error: "Could not verify the authenticator. Check server MFA configuration." });
  }
});

// Complete administrator login only after a valid six-digit TOTP code.
router.post("/admin/mfa/verify", loginLimiter, async (req: Request, res: Response) => {
  const body = z.object({
    challengeToken: z.string().min(1),
    code: z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Enter the six-digit authenticator code." }); return; }
  const payload = verifyJwt(body.data.challengeToken);
  if (!payload || payload.purpose !== "admin_mfa_challenge") {
    res.status(401).json({ error: "Administrator verification expired. Sign in again." });
    return;
  }
  const [account] = await db.select().from(users).where(eq(users.id, payload.sub));
  if (!account || !account.isActive || account.accountType !== "admin" ||
      !account.adminTotpEnabled || !account.adminTotpSecretEnc || !payload.challengeId) {
    res.status(403).json({ error: "Administrator account is not eligible to sign in." });
    return;
  }
  try {
    const secret = decryptTotpSecret(account.adminTotpSecretEnc);
    const challengeAccepted = await db.transaction(async (tx) => {
      const [challenge] = await tx.select().from(adminMfaChallenges)
        .where(eq(adminMfaChallenges.id, payload.challengeId!)).for("update");
      const tokenHash = crypto.createHash("sha256").update(body.data.challengeToken).digest("hex");
      if (!challenge || challenge.userId !== account.id || challenge.consumedAt ||
          challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= 5 ||
          challenge.codeHash !== tokenHash) return false;
      if (!verifyTotp(secret, body.data.code)) {
        await tx.update(adminMfaChallenges)
          .set({ attempts: challenge.attempts + 1 })
          .where(eq(adminMfaChallenges.id, challenge.id));
        return false;
      }
      await tx.update(adminMfaChallenges)
        .set({ consumedAt: new Date() })
        .where(eq(adminMfaChallenges.id, challenge.id));
      return true;
    });
    if (!challengeAccepted) {
      res.status(401).json({ error: "Invalid, expired, or already-used authenticator challenge." });
      return;
    }
    const token = signJwt({
      sub: account.id, phone: account.phone, username: account.username, isAdmin: true,
    }, 12 * 60 * 60);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const now = new Date();
    await db.insert(adminSessions).values({
      userId: account.id,
      tokenHash,
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
    });
    res.json({
      token,
      user: { id: account.id, phone: account.phone, username: account.username, isAdmin: true },
    });
  } catch (error) {
    logger.error({ error, userId: account.id }, "Administrator MFA login failed");
    res.status(503).json({ error: "Administrator sign-in is temporarily unavailable." });
  }
});

router.post("/logout", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as JwtPayload;
  const token = extractToken(req.headers.authorization);
  if (token && user.isAdmin) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await db.update(adminSessions).set({ revokedAt: new Date() })
      .where(eq(adminSessions.tokenHash, tokenHash));
  }
  res.json({ success: true });
});

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as JwtPayload;
  const [dbUser] = await db.select().from(users).where(eq(users.id, user.sub));
  if (!dbUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (dbUser.accountType === "admin") {
    const token = extractToken(req.headers.authorization);
    const tokenHash = token ? crypto.createHash("sha256").update(token).digest("hex") : "";
    const [session] = tokenHash
      ? await db.select().from(adminSessions).where(eq(adminSessions.tokenHash, tokenHash)).limit(1)
      : [];
    const now = Date.now();
    if (!session || session.userId !== dbUser.id || session.revokedAt ||
        session.expiresAt.getTime() <= now ||
        now - session.lastActivityAt.getTime() > 15 * 60 * 1000 ||
        now - session.createdAt.getTime() > 12 * 60 * 60 * 1000) {
      res.status(401).json({ error: "Administrator session expired. Please sign in again." });
      return;
    }
    await db.update(adminSessions).set({
      lastActivityAt: new Date(now),
      expiresAt: new Date(Math.min(now + 15 * 60 * 1000, session.createdAt.getTime() + 12 * 60 * 60 * 1000)),
    }).where(eq(adminSessions.id, session.id));
  }
  res.json({
    id: dbUser.id,
    phone: dbUser.phone,
    username: dbUser.username,
    email: dbUser.email,
    isAdmin: dbUser.accountType === "admin",
    accountType: dbUser.accountType,
  });
});


router.post("/change-password", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as JwtPayload;

  const body = z.object({
    currentPassword: z.string().min(1),
    newPassword:     z.string().min(6, "New password must be at least 6 characters").max(72),
  }).safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const [dbUser] = await db.select().from(users).where(eq(users.id, user.sub));
  if (!dbUser || !dbUser.passwordHash) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const valid = await verifyPassword(body.data.currentPassword, dbUser.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const newHash = await hashPassword(body.data.newPassword);
  await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, user.sub));

  res.json({ success: true, message: "Password updated successfully" });
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
