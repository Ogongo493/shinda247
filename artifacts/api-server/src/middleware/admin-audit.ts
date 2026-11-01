import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { desc, sql } from "drizzle-orm";
import { db, adminAuditLog } from "@workspace/db";
import { logger } from "../lib/logger";

/**
 * Append an immutable, hash-chained record after each administrator mutation.
 * The transaction-scoped advisory lock serializes hash-chain writes.
 */
export function auditAdminMutation(req: Request, res: Response, next: NextFunction): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    next();
    return;
  }

  const admin = (req as any).user as { sub?: number } | undefined;
  const adminUserId = admin?.sub;
  const startedAt = new Date();

  res.once("finish", () => {
    if (!adminUserId) return;
    void (async () => {
      const action = `ADMIN ${req.method} ${req.path.slice(0, 90)}`;
      const outcome = res.statusCode >= 200 && res.statusCode < 400 ? "success" : "failure";
      const pathParts = req.path.split("/");
      const targetId = pathParts[1] === "players" ? pathParts[2] ?? null : null;
      const targetType = targetId ? "player" : req.path.startsWith("/house-reserve") ? "house_reserve" : req.path.startsWith("/game-control") ? "game_control" : null;
      const createdAt = new Date();
      const details = {
        method: req.method,
        path: req.path.slice(0, 250),
        statusCode: res.statusCode,
        durationMs: Math.max(0, Date.now() - startedAt.getTime()),
      };
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(742019)`);
        const [previous] = await tx.select({ entryHash: adminAuditLog.entryHash })
          .from(adminAuditLog)
          .orderBy(desc(adminAuditLog.id))
          .limit(1);
        const previousHash = previous?.entryHash ?? null;
        const canonical = JSON.stringify({
          adminUserId,
          action,
          targetType,
          targetId,
          outcome,
          ipAddress: req.ip ?? null,
          createdAt: createdAt.toISOString(),
          userAgent: req.get("user-agent") ?? null,
          details,
          previousHash,
        });
        const entryHash = crypto.createHash("sha256").update(canonical).digest("hex");
        await tx.insert(adminAuditLog).values({
          adminUserId,
          action,
          targetType,
          targetId,
          outcome,
          ipAddress: req.ip ?? null,
          createdAt,
          userAgent: req.get("user-agent")?.slice(0, 1000) ?? null,
          details,
          previousHash,
          entryHash,
        });
      });
    })().catch((error) => {
      logger.error({ error, adminUserId, method: req.method, path: req.path }, "Failed to append administrator audit record");
    });
  });

  next();
}
