import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { desc, sql } from "drizzle-orm";
import { db, adminAuditLog } from "@workspace/db";
import { logger } from "../lib/logger";

/**
 * Persist an immutable audit entry before returning an administrator mutation
 * response. If persistence fails, do not report success to the caller.
 */
export function auditAdminMutation(req: Request, res: Response, next: NextFunction): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    next();
    return;
  }

  const admin = (req as any).user as { sub?: number } | undefined;
  const adminUserId = admin?.sub;
  if (!adminUserId) {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  let auditStarted = false;

  async function appendAudit(statusCode: number): Promise<void> {
    const action = `ADMIN ${req.method} ${req.path.slice(0, 90)}`;
    const outcome = statusCode >= 200 && statusCode < 400 ? "success" : "failure";
    const pathParts = req.path.split("/");
    const targetId = pathParts[1] === "players" ? pathParts[2] ?? null : null;
    const targetType = targetId
      ? "player"
      : req.path.startsWith("/house-reserve")
        ? "house_reserve"
        : req.path.startsWith("/game-control")
          ? "game_control"
          : null;
    const createdAt = new Date();
    const userAgent = req.get("user-agent")?.slice(0, 1000) ?? null;
    // Capture only operational fields needed to understand the action.
    // Never copy passwords, authenticator codes, tokens, or arbitrary request bodies.
    const details = {
      method: req.method,
      path: req.path.slice(0, 250),
      statusCode,
      ...(typeof req.body?.action === "string" ? { requestedAction: req.body.action.slice(0, 40) } : {}),
      ...(typeof req.body?.amountKes === "number" ? { amountKes: req.body.amountKes } : {}),
      ...(typeof req.body?.paused === "boolean" ? { paused: req.body.paused } : {}),
      ...(typeof req.body?.reason === "string" ? { reason: req.body.reason.trim().slice(0, 250) } : {}),
    };

    await db.transaction(async (tx) => {
      // Serialize inserts so each hash points to the immediately preceding entry.
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
        userAgent,
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
        userAgent,
        details,
        previousHash,
        entryHash,
      });
    });
  }

  res.json = ((body?: any) => {
    if (auditStarted) return res;
    auditStarted = true;
    const statusCode = res.statusCode;
    void appendAudit(statusCode)
      .then(() => originalJson(body))
      .catch((error) => {
        logger.error({ error, adminUserId, method: req.method, path: req.path }, "Administrator audit persistence failed");
        // The underlying action may already have committed. Avoid falsely telling
        // the caller it was safely recorded; they should inspect state before retrying.
        res.status(500);
        originalJson({
          error: "The request could not be confirmed because its audit record was not saved. Check the current state before retrying.",
        });
      });
    return res;
  }) as Response["json"];

  next();
}
