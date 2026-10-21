import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@workspace/db";
import { wallets, transactions, mpesaCallbacks } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { initiateStkPush, initiateB2CPayment } from "../lib/daraja";
import { creditWallet, debitWallet } from "@workspace/db";
import { requireAuth } from "./auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MIN_DEPOSIT_KES    = 10;
const MAX_DEPOSIT_KES    = 150_000;
const MIN_WITHDRAWAL_KES = 50;
const MAX_WITHDRAWAL_KES = 150_000;
const MPESA_CALLBACK_TOKEN = process.env.MPESA_CALLBACK_TOKEN ?? "";

/** Daraja callbacks do not provide a verifiable signature; require a high-entropy shared URL token. */
function isAuthorizedDarajaCallback(req: Request): boolean {
  const supplied = req.query.token;
  if (MPESA_CALLBACK_TOKEN.length < 32 || typeof supplied !== "string") return false;
  const expectedBytes = Buffer.from(MPESA_CALLBACK_TOKEN, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

// In-memory map: checkoutRequestId → userId
// Backed by the transactions table for durability
const pendingDeposits = new Map<string, number>();

const DepositSchema = z.object({
  phone:     z.string().min(9).max(15),
  amountKes: z.number().int().min(MIN_DEPOSIT_KES).max(MAX_DEPOSIT_KES),
});

router.post("/deposit", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as { sub: number; phone: string };
  const body = DepositSchema.safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const { phone, amountKes } = body.data;
  const amountCents = Math.round(amountKes * 100);

  const result = await initiateStkPush(
    phone,
    amountKes,
    `SHINDA-${user.sub}`,
    `Shinda247 deposit KES ${amountKes}`
  );

  if (!result.success) {
    res.status(502).json({ error: result.error ?? "STK Push failed" });
    return;
  }

  // Record the pending deposit so we can credit the wallet on callback
  if (result.checkoutRequestId) {
    pendingDeposits.set(result.checkoutRequestId, user.sub);

    // Also persist in transactions table (status=pending) for crash recovery
    const [wallet] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.userId, user.sub));

    await db.insert(transactions).values({
      userId:            user.sub,
      type:              "deposit",
      status:            "pending",
      amountCents,
      balanceBefore:     wallet?.balanceCents ?? 0,
      balanceAfter:      wallet?.balanceCents ?? 0,
      checkoutRequestId: result.checkoutRequestId,
      mpesaPhone:        phone,
      description:       `M-Pesa deposit KES ${amountKes} pending`,
    });
  }

  logger.info({ userId: user.sub, phone, amountKes, checkoutRequestId: result.checkoutRequestId }, "STK Push initiated");

  res.json({
    message: "Check your phone and enter your M-Pesa PIN to complete the deposit.",
    checkoutRequestId: result.checkoutRequestId,
  });
});

const CallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID:  z.string(),
      CheckoutRequestID:  z.string(),
      ResultCode:         z.number(),
      ResultDesc:         z.string(),
      CallbackMetadata:   z.object({
        Item: z.array(z.object({ Name: z.string(), Value: z.union([z.string(), z.number()]).optional() }))
      }).optional(),
    }),
  }),
});

router.post("/callback", async (req: Request, res: Response) => {
  if (!isAuthorizedDarajaCallback(req)) {
    logger.warn("Rejected M-Pesa STK callback: missing or invalid callback token");
    res.status(403).json({ ResultCode: 1, ResultDesc: "Unauthorized" });
    return;
  }

  // Safaricom expects a prompt acknowledgement; processing continues server-side.
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    const body = CallbackSchema.safeParse(req.body);
    if (!body.success) {
      logger.warn({ body: req.body }, "Invalid M-Pesa callback shape");
      return;
    }

    const cb = body.data.Body.stkCallback;
    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = cb;
    const getItem = (name: string) => CallbackMetadata?.Item.find(i => i.Name === name)?.Value;

    const amountKes = Number(getItem("Amount") ?? 0);
    const amountCents = Math.round(amountKes * 100);
    const mpesaRef = String(getItem("MpesaReceiptNumber") ?? "");
    const phone = String(getItem("PhoneNumber") ?? "");

    await db.insert(mpesaCallbacks).values({
      checkoutRequestId: CheckoutRequestID,
      merchantRequestId: MerchantRequestID,
      resultCode: ResultCode,
      resultDesc: ResultDesc,
      amountCents: Number.isFinite(amountCents) ? amountCents : 0,
      mpesaReceiptNumber: mpesaRef || null,
      phoneNumber: phone || null,
      rawPayload: JSON.stringify(req.body),
    }).onConflictDoNothing();

    if (ResultCode !== 0) {
      await db.transaction(async (tx) => {
        const [pending] = await tx.select().from(transactions)
          .where(and(
            eq(transactions.checkoutRequestId, CheckoutRequestID),
            eq(transactions.type, "deposit"),
            eq(transactions.status, "pending"),
          ))
          .for("update");

        if (pending?.type === "deposit" && pending.status === "pending") {
          await tx.update(transactions)
            .set({ status: "failed", failureReason: ResultDesc, processedAt: new Date() })
            .where(eq(transactions.id, pending.id));
        }

        await tx.update(mpesaCallbacks)
          .set({ processed: true, processedAt: new Date() })
          .where(eq(mpesaCallbacks.checkoutRequestId, CheckoutRequestID));
      });

      pendingDeposits.delete(CheckoutRequestID);
      logger.info({ CheckoutRequestID, ResultCode, ResultDesc }, "M-Pesa payment failed/cancelled");
      return;
    }

    if (!Number.isSafeInteger(amountKes) || amountKes <= 0 || !mpesaRef) {
      logger.error({ CheckoutRequestID, amountKes, mpesaRef }, "M-Pesa success callback missing a valid amount or receipt; not crediting wallet");
      return;
    }

    const outcome = await db.transaction(async (tx) => {
      const [pending] = await tx.select().from(transactions)
        .where(and(
          eq(transactions.checkoutRequestId, CheckoutRequestID),
          eq(transactions.type, "deposit"),
          eq(transactions.status, "pending"),
        ))
        .for("update");

      if (!pending) {
        const [existing] = await tx.select({ id: transactions.id }).from(transactions)
          .where(eq(transactions.checkoutRequestId, CheckoutRequestID))
          .limit(1);

        if (existing) {
          await tx.update(mpesaCallbacks)
            .set({ processed: true, processedAt: new Date() })
            .where(eq(mpesaCallbacks.checkoutRequestId, CheckoutRequestID));
          return "already-processed" as const;
        }

        logger.error({ CheckoutRequestID }, "No matching pending deposit transaction for M-Pesa callback");
        return "unmatched" as const;
      }

      if (pending.amountCents !== amountCents) {
        logger.error({
          CheckoutRequestID,
          expectedAmountCents: pending.amountCents,
          callbackAmountCents: amountCents,
          mpesaRef,
        }, "M-Pesa callback amount mismatch; wallet not credited");
        await tx.update(mpesaCallbacks)
          .set({ processed: true, processedAt: new Date() })
          .where(eq(mpesaCallbacks.checkoutRequestId, CheckoutRequestID));
        return "amount-mismatch" as const;
      }

      const [duplicateReceipt] = await tx.select({ id: transactions.id }).from(transactions)
        .where(eq(transactions.mpesaRef, mpesaRef))
        .limit(1);

      if (duplicateReceipt && duplicateReceipt.id !== pending.id) {
        logger.error({ CheckoutRequestID, mpesaRef }, "M-Pesa receipt already belongs to another transaction; wallet not credited");
        await tx.update(mpesaCallbacks)
          .set({ processed: true, processedAt: new Date() })
          .where(eq(mpesaCallbacks.checkoutRequestId, CheckoutRequestID));
        return "duplicate-receipt" as const;
      }

      const [wallet] = await tx.select().from(wallets)
        .where(eq(wallets.userId, pending.userId))
        .for("update");

      if (!wallet) throw new Error(`Wallet not found for user ${pending.userId}`);

      const balanceAfter = wallet.balanceCents + amountCents;
      await tx.update(wallets).set({
        balanceCents: balanceAfter,
        totalDeposited: sql`${wallets.totalDeposited} + ${amountCents}`,
        updatedAt: new Date(),
      }).where(eq(wallets.userId, pending.userId));

      await tx.update(transactions).set({
        status: "completed",
        mpesaRef,
        mpesaPhone: phone || pending.mpesaPhone,
        balanceBefore: wallet.balanceCents,
        balanceAfter,
        description: `M-Pesa deposit KES ${amountKes} (${mpesaRef})`,
        processedAt: new Date(),
      }).where(eq(transactions.id, pending.id));

      await tx.update(mpesaCallbacks)
        .set({ processed: true, processedAt: new Date() })
        .where(eq(mpesaCallbacks.checkoutRequestId, CheckoutRequestID));

      return "credited" as const;
    });

    if (outcome === "credited" || outcome === "already-processed" || outcome === "amount-mismatch" || outcome === "duplicate-receipt") {
      pendingDeposits.delete(CheckoutRequestID);
    }
    if (outcome === "credited") {
      logger.info({ CheckoutRequestID, amountKes, mpesaRef }, "Wallet credited from verified M-Pesa deposit");
    }
  } catch (err) {
    logger.error({ err }, "Error processing M-Pesa callback");
  }
});

const WithdrawSchema = z.object({
  phone:     z.string().min(9).max(15),
  amountKes: z.number().int().min(MIN_WITHDRAWAL_KES).max(MAX_WITHDRAWAL_KES),
});

router.post("/withdraw", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as { sub: number };
  const body = WithdrawSchema.safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const { phone, amountKes } = body.data;
  const amountCents = Math.round(amountKes * 100);

  const debitResult = await debitWallet(user.sub, amountCents, "withdrawal", {
    mpesaPhone:  phone,
    description: `Withdrawal KES ${amountKes} to ${phone}`,
  });

  if (!debitResult.success) {
    res.status(400).json({ error: debitResult.error ?? "Insufficient balance" });
    return;
  }

  const b2cResult = await initiateB2CPayment(phone, amountKes, `Shinda247 withdrawal`);

  if (!b2cResult.success) {
    // Reverse the debit
    await creditWallet(user.sub, amountCents, "refund", {
      description: `Reversal: B2C failed for withdrawal of KES ${amountKes}`,
    });
    res.status(502).json({ error: b2cResult.error ?? "Withdrawal failed" });
    return;
  }

  logger.info({ userId: user.sub, phone, amountKes, conversationId: b2cResult.conversationId }, "B2C withdrawal initiated");

  res.json({
    message: `KES ${amountKes} will be sent to ${phone} shortly.`,
    conversationId: b2cResult.conversationId,
    newBalanceCents: debitResult.newBalanceCents,
  });
});

router.post("/b2c-result", async (req: Request, res: Response) => {
  if (!isAuthorizedDarajaCallback(req)) {
    logger.warn("Rejected M-Pesa B2C result callback: missing or invalid callback token");
    res.status(403).json({ ResultCode: 1, ResultDesc: "Unauthorized" });
    return;
  }
  // Callback reconciliation is intentionally not performed until withdrawal state
  // and provider conversation IDs are durably persisted.
  logger.info({ conversationId: req.body?.Result?.ConversationID }, "Authorized B2C result callback received; reconciliation pending implementation");
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

router.post("/b2c-timeout", async (req: Request, res: Response) => {
  if (!isAuthorizedDarajaCallback(req)) {
    logger.warn("Rejected M-Pesa B2C timeout callback: missing or invalid callback token");
    res.status(403).json({ ResultCode: 1, ResultDesc: "Unauthorized" });
    return;
  }
  logger.warn({ conversationId: req.body?.Result?.ConversationID }, "Authorized B2C timeout callback received; reconciliation pending implementation");
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

async function resolveUserFromCheckoutRequest(checkoutRequestId: string): Promise<number | null> {
  // Check in-memory map first (fast path)
  const inMemory = pendingDeposits.get(checkoutRequestId);
  if (inMemory) return inMemory;

  // Fallback: look up in transactions table (handles server restarts)
  try {
    const [tx] = await db.select({ userId: transactions.userId })
      .from(transactions)
      .where(eq(transactions.checkoutRequestId, checkoutRequestId));
    return tx?.userId ?? null;
  } catch {
    return null;
  }
}

export default router;
