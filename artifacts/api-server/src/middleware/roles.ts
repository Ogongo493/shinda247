import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db, users, adminSessions } from "@workspace/db";
import { eq } from "drizzle-orm";
import { extractToken } from "../lib/jwt";

const ADMIN_IDLE_MS = 15 * 60 * 1000;
const ADMIN_ABSOLUTE_MS = 12 * 60 * 60 * 1000;

/** Re-check the authoritative database role on every player-only request. */
export async function requirePlayerRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (req as any).user as { sub?: number } | undefined;
    if (!user?.sub) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const [account] = await db.select({
      accountType: users.accountType,
      isActive: users.isActive,
    }).from(users).where(eq(users.id, user.sub));
    if (!account || !account.isActive) {
      res.status(403).json({ error: "Account is unavailable" });
      return;
    }
    if (account.accountType !== "player") {
      res.status(403).json({ error: "This account is restricted to administrator access." });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Admin access requires both the authoritative admin role and a server-side
 * session created only after successful MFA. Activity is extended on each call,
 * but never beyond the 12-hour absolute session lifetime.
 */
export async function requireAdminRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (req as any).user as { sub?: number } | undefined;
    const token = extractToken(req.headers.authorization);
    if (!user?.sub || !token) {
      res.status(403).json({ error: "Administrator access required" });
      return;
    }
    const [account] = await db.select({
      accountType: users.accountType,
      isActive: users.isActive,
    }).from(users).where(eq(users.id, user.sub));
    if (!account || !account.isActive || account.accountType !== "admin") {
      res.status(403).json({ error: "Administrator access required" });
      return;
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const [session] = await db.select().from(adminSessions)
      .where(eq(adminSessions.tokenHash, tokenHash)).limit(1);
    const now = Date.now();
    if (!session || session.userId !== user.sub || session.revokedAt ||
        session.expiresAt.getTime() <= now ||
        now - session.lastActivityAt.getTime() > ADMIN_IDLE_MS ||
        now - session.createdAt.getTime() > ADMIN_ABSOLUTE_MS) {
      if (session && !session.revokedAt) {
        await db.update(adminSessions).set({ revokedAt: new Date() })
          .where(eq(adminSessions.id, session.id));
      }
      res.status(401).json({ error: "Administrator session expired. Please sign in again." });
      return;
    }

    const absoluteExpiry = session.createdAt.getTime() + ADMIN_ABSOLUTE_MS;
    const nextExpiry = new Date(Math.min(now + ADMIN_IDLE_MS, absoluteExpiry));
    await db.update(adminSessions).set({
      lastActivityAt: new Date(now),
      expiresAt: nextExpiry,
    }).where(eq(adminSessions.id, session.id));
    next();
  } catch (error) {
    next(error);
  }
}
