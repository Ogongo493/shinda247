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

  logger.info({ userId: user.sub, phone, amountKes, checkoutRequestId: result.checkoutRequestId }, "STK Push initiated");

  res.json({
    message: "STK Push sent. Enter your M-Pesa PIN to complete deposit.",
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
      checkoutRequestId: CheckoutRequestID,
      merchantRequestId: MerchantRequestID,
      resultCode: ResultCode,
      resultDesc: ResultDesc,
      amountCents: Math.round(amountKes * 100),
      mpesaReceiptNumber: mpesaRef || null,
      phoneNumber: phone || null,
      rawPayload: JSON.stringify(req.body),
    }).onConflictDoNothing();

    if (ResultCode !== 0) {
      logger.info({ CheckoutRequestID, ResultCode, ResultDesc }, "M-Pesa payment failed/cancelled");
      return;
    }

    const [pending] = await db.select().from(transactions)
      .where(eq(transactions.checkoutRequestId, CheckoutRequestID));

    if (pending) {
      logger.info({ CheckoutRequestID }, "Duplicate M-Pesa callback — already processed");
      return;
    }

    const userId = await resolveUserFromCheckoutRequest(CheckoutRequestID);
    if (!userId) {
      logger.error({ CheckoutRequestID }, "Could not resolve userId from checkoutRequestId");
      return;
    }

    const amountCents = Math.round(amountKes * 100);
    await creditWallet(userId, amountCents, "deposit", {
      mpesaRef,
      checkoutRequestId: CheckoutRequestID,
      mpesaPhone: phone,
      description: `M-Pesa deposit KES ${amountKes} (${mpesaRef})`,
    });

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
    mpesaPhone: phone,
    description: `Withdrawal KES ${amountKes} to ${phone}`,
  });

  if (!debitResult.success) {
    res.status(400).json({ error: debitResult.error ?? "Insufficient balance" });
    return;
  }

  const b2cResult = await initiateB2CPayment(phone, amountKes, `Shinda247 withdrawal`);

  if (!b2cResult.success) {
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

async function resolveUserFromCheckoutRequest(_checkoutRequestId: string): Promise<number | null> {
  return null;
}

export default router;
