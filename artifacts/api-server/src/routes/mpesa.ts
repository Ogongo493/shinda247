import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { wallets, transactions, mpesaCallbacks } from "@workspace/db";
import { eq } from "drizzle-orm";
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

const DepositSchema = z.object({
  phone:     z.string().min(9).max(15),
  amountKes: z.number().min(MIN_DEPOSIT_KES).max(MAX_DEPOSIT_KES),
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
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    const body = CallbackSchema.safeParse(req.body);
    if (!body.success) {
      logger.warn({ body: req.body }, "Invalid M-Pesa callback shape");
      return;
    }

    const cb = body.data.Body.stkCallback;
    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = cb;

    const getItem = (name: string) =>
      CallbackMetadata?.Item.find(i => i.Name === name)?.Value;

    const amountKes = Number(getItem("Amount") ?? 0);
    const mpesaRef  = String(getItem("MpesaReceiptNumber") ?? "");
    const phone     = String(getItem("PhoneNumber") ?? "");

    await db.insert(mpesaCallbacks).values({
      checkoutRequestId:  CheckoutRequestID,
      merchantRequestId:  MerchantRequestID,
      resultCode:         ResultCode,
      resultDesc:         ResultDesc,
      amountCents:        Math.round(amountKes * 100),
      mpesaReceiptNumber: mpesaRef || null,
      phoneNumber:        phone || null,
      rawPayload:         JSON.stringify(req.body),
    }).onConflictDoNothing();

    if (ResultCode !== 0) {
      logger.info({ CheckoutRequestID, ResultCode, ResultDesc }, "M-Pesa payment failed/cancelled");
      // Mark pending transaction as failed
      await db.update(transactions)
        .set({ status: "failed", failureReason: ResultDesc, processedAt: new Date() })
        .where(eq(transactions.checkoutRequestId, CheckoutRequestID));
      pendingDeposits.delete(CheckoutRequestID);
      return;
    }

    // Resolve the user who initiated this deposit
    const userId = await resolveUserFromCheckoutRequest(CheckoutRequestID);
    if (!userId) {
      logger.error({ CheckoutRequestID }, "Could not resolve userId from checkoutRequestId");
      return;
    }

    // Idempotency: check if already processed
    const alreadyDone = await db.select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.checkoutRequestId, CheckoutRequestID));

    const existing = alreadyDone.find(t => t.id);
    // Check via mpesaRef to avoid double credits
    if (mpesaRef) {
      const withRef = await db.select({ id: transactions.id }).from(transactions)
        .where(eq(transactions.mpesaRef, mpesaRef));
      if (withRef.length > 0) {
        logger.info({ CheckoutRequestID, mpesaRef }, "Duplicate M-Pesa callback — already credited");
        return;
      }
    }

    const amountCents = Math.round(amountKes * 100);
    await creditWallet(userId, amountCents, "deposit", {
      mpesaRef,
      checkoutRequestId: CheckoutRequestID,
      mpesaPhone: phone,
      description: `M-Pesa deposit KES ${amountKes} (${mpesaRef})`,
    });

    // Clean up the in-memory map
    pendingDeposits.delete(CheckoutRequestID);

    logger.info({ userId, amountKes, mpesaRef }, "Wallet credited from M-Pesa deposit");
  } catch (err) {
    logger.error({ err }, "Error processing M-Pesa callback");
  }
});

const WithdrawSchema = z.object({
  phone:     z.string().min(9).max(15),
  amountKes: z.number().min(MIN_WITHDRAWAL_KES).max(MAX_WITHDRAWAL_KES),
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
  logger.info({ body: req.body }, "B2C result callback received");
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

router.post("/b2c-timeout", async (req: Request, res: Response) => {
  logger.warn({ body: req.body }, "B2C timeout callback received");
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
