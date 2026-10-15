import { Router, type IRouter, type Request, type Response } from "express";
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

// In-memory map: checkoutRequestId → userId
// Backed by the transactions table for durability

const pendingDeposits = new Map<string, number>();

/**
 * Refunds a withdrawal only while its ledger row is pending. The row lock makes
 * duplicate provider callbacks safe: only the first callback can issue a refund.
 */
async function refundPendingWithdrawal(transactionId: number, reason: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [withdrawal] = await tx.select().from(transactions)
      .where(and(
        eq(transactions.id, transactionId),
        eq(transactions.type, "withdrawal"),
        eq(transactions.status, "pending"),
      ))
      .for("update");

    if (!withdrawal) return false;

    const [wallet] = await tx.select().from(wallets)
      .where(eq(wallets.userId, withdrawal.userId))
      .for("update");

    if (!wallet) throw new Error(`Wallet not found for user ${withdrawal.userId}`);

    const balanceAfter = wallet.balanceCents + withdrawal.amountCents;
    await tx.update(wallets).set({
      balanceCents: balanceAfter,
      totalWithdrawn: sql`${wallets.totalWithdrawn} - ${withdrawal.amountCents}`,
      updatedAt: new Date(),
    }).where(eq(wallets.userId, withdrawal.userId));

    await tx.update(transactions).set({
      status: "failed",
      failureReason: reason,
      processedAt: new Date(),
    }).where(eq(transactions.id, withdrawal.id));

    await tx.insert(transactions).values({
      userId: withdrawal.userId,
      type: "refund",
      status: "completed",
      amountCents: withdrawal.amountCents,
      balanceBefore: wallet.balanceCents,
      balanceAfter,
      mpesaPhone: withdrawal.mpesaPhone,
      description: `Refund for failed withdrawal #${withdrawal.id}: ${reason}`,
      processedAt: new Date(),
    });

    return true;
  });
}

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

  // Mark the debit pending before contacting Daraja. Provider callbacks settle this
  // exact ledger row; they must never create a second withdrawal or refund.
  await db.update(transactions).set({
    status: "pending",
    checkoutRequestId: `pending-withdrawal-${debitResult.transactionId}`,
  }).where(eq(transactions.id, debitResult.transactionId));

  const b2cResult = await initiateB2CPayment(phone, amountKes, `Shinda247 withdrawal`);

  if (!b2cResult.success) {
    await refundPendingWithdrawal(debitResult.transactionId, b2cResult.error ?? "B2C request rejected");
    res.status(502).json({ error: b2cResult.error ?? "Withdrawal failed" });
    return;
  }

  if (!b2cResult.conversationId) {
    logger.error({ transactionId: debitResult.transactionId }, "B2C accepted without a ConversationID; withdrawal left pending for reconciliation");
    res.status(202).json({ message: "Withdrawal submitted; confirmation is pending.", newBalanceCents: debitResult.newBalanceCents });
    return;
  }

  await db.update(transactions).set({
    checkoutRequestId: b2cResult.conversationId,
    description: `M-Pesa withdrawal KES ${amountKes} to ${phone} pending provider confirmation`,
  }).where(and(
    eq(transactions.id, debitResult.transactionId),
    eq(transactions.type, "withdrawal"),
    eq(transactions.status, "pending"),
  ));

  logger.info({ userId: user.sub, phone, amountKes, conversationId: b2cResult.conversationId, transactionId: debitResult.transactionId }, "B2C withdrawal initiated");

  res.json({
    message: `KES ${amountKes} will be sent to ${phone} shortly.`,
    conversationId: b2cResult.conversationId,
    newBalanceCents: debitResult.newBalanceCents,
  });
});

const B2CResultSchema = z.object({
  Result: z.object({
    ConversationID: z.string().optional(),
    OriginatorConversationID: z.string().optional(),
    ResultCode: z.number(),
    ResultDesc: z.string(),
    TransactionID: z.string().optional(),
  }),
});

async function settleB2CResult(payload: unknown): Promise<void> {
  const parsed = B2CResultSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "Invalid M-Pesa B2C result callback shape");
    return;
  }

  const result = parsed.data.Result;
  const conversationId = result.ConversationID;
  if (!conversationId) {
    logger.error({ originatorConversationId: result.OriginatorConversationID }, "B2C result missing ConversationID; manual reconciliation required");
    return;
  }

  const [withdrawal] = await db.select().from(transactions)
    .where(and(
      eq(transactions.checkoutRequestId, conversationId),
      eq(transactions.type, "withdrawal"),
    ))
    .limit(1);

  if (!withdrawal) {
    logger.error({ conversationId, resultCode: result.ResultCode }, "B2C callback has no matching withdrawal; manual reconciliation required");
    return;
  }

  if (result.ResultCode !== 0) {
    const refunded = await refundPendingWithdrawal(withdrawal.id, result.ResultDesc || "B2C payment failed");
    logger.warn({ conversationId, transactionId: withdrawal.id, refunded, resultCode: result.ResultCode, resultDesc: result.ResultDesc }, "B2C withdrawal failed");
    return;
  }

  if (!result.TransactionID) {
    logger.error({ conversationId, transactionId: withdrawal.id }, "B2C success callback missing TransactionID; withdrawal remains pending");
    return;
  }

  const [updated] = await db.update(transactions).set({
    status: "completed",
    mpesaRef: result.TransactionID,
    failureReason: null,
    description: `M-Pesa withdrawal completed (${result.TransactionID})`,
    processedAt: new Date(),
  }).where(and(
    eq(transactions.id, withdrawal.id),
    eq(transactions.type, "withdrawal"),
    eq(transactions.status, "pending"),
  )).returning({ id: transactions.id });

  if (updated) {
    logger.info({ conversationId, transactionId: updated.id, mpesaTransactionId: result.TransactionID }, "B2C withdrawal confirmed");
  } else {
    logger.info({ conversationId, transactionId: withdrawal.id }, "Duplicate or already-settled B2C result ignored");
  }
}

router.post("/b2c-result", async (req: Request, res: Response) => {
  // Acknowledge quickly; processing is idempotent and backed by the ledger.
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  try {
    await settleB2CResult(req.body);
  } catch (err) {
    logger.error({ err }, "Error reconciling M-Pesa B2C result callback");
  }
});

router.post("/b2c-timeout", async (req: Request, res: Response) => {
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  try {
    const payload = z.object({
      Result: z.object({
        ConversationID: z.string().optional(),
        OriginatorConversationID: z.string().optional(),
        ResultDesc: z.string().optional(),
      }),
    }).safeParse(req.body);

    if (!payload.success || !payload.data.Result.ConversationID) {
      logger.warn({ issues: payload.success ? [] : payload.error.issues }, "Invalid M-Pesa B2C timeout callback");
      return;
    }

    const conversationId = payload.data.Result.ConversationID;
    const [withdrawal] = await db.select().from(transactions)
      .where(and(
        eq(transactions.checkoutRequestId, conversationId),
        eq(transactions.type, "withdrawal"),
      ))
      .limit(1);

    if (!withdrawal) {
      logger.error({ conversationId }, "B2C timeout has no matching withdrawal; manual reconciliation required");
      return;
    }

    const refunded = await refundPendingWithdrawal(
      withdrawal.id,
      payload.data.Result.ResultDesc ?? "B2C queue timeout",
    );
    logger.warn({ conversationId, transactionId: withdrawal.id, refunded }, "B2C withdrawal timeout processed");
  } catch (err) {
    logger.error({ err }, "Error reconciling M-Pesa B2C timeout callback");
  }
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
