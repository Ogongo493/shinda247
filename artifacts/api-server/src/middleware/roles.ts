import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { users } from "@workspace/db";
import { eq } from "drizzle-orm";

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

/** Re-check the authoritative database role; never trust the JWT role claim. */
export async function requireAdminRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (req as any).user as { sub?: number } | undefined;
    if (!user?.sub) {
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
    next();
  } catch (error) {
    next(error);
  }
}
