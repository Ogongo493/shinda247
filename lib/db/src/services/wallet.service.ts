import { db } from '../index';
import { wallets, transactions } from '../schema';
import { eq, sql } from 'drizzle-orm';

export type TransactionType = 'deposit' | 'withdrawal' | 'bet' | 'win' | 'refund' | 'bonus';

export interface CreditResult {
  success: boolean;
  newBalanceCents: number;
  transactionId: number;
  error?: string;
}

export interface DebitResult {
  success: boolean;
  newBalanceCents: number;
  transactionId: number;
  error?: string;
}

export async function creditWallet(
  userId: number,
  amountCents: number,
  type: TransactionType,
  opts: {
    mpesaRef?: string;
    checkoutRequestId?: string;
    mpesaPhone?: string;
    gameId?: number;
    betId?: number;
    description?: string;
  } = {}
): Promise<CreditResult> {
  if (amountCents <= 0) {
    return { success: false, newBalanceCents: 0, transactionId: 0, error: 'Amount must be positive' };
  }

  return await db.transaction(async (tx) => {
    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .for('update');

    if (!wallet) throw new Error(`Wallet not found for user ${userId}`);

    const balanceBefore = wallet.balanceCents;
    const balanceAfter  = balanceBefore + amountCents;

    await tx.update(wallets).set({
      balanceCents:   balanceAfter,
      totalDeposited: type === 'deposit' ? sql`${wallets.totalDeposited} + ${amountCents}` : wallets.totalDeposited,
      updatedAt:      new Date(),
    }).where(eq(wallets.userId, userId));

    const [txn] = await tx.insert(transactions).values({
      userId, type, status: 'completed',
      amountCents, balanceBefore, balanceAfter,
      mpesaRef:          opts.mpesaRef,
      checkoutRequestId: opts.checkoutRequestId,
      mpesaPhone:        opts.mpesaPhone,
      gameId:            opts.gameId,
      betId:             opts.betId,
      description:       opts.description,
      processedAt:       new Date(),
    }).returning({ id: transactions.id });

    return { success: true, newBalanceCents: balanceAfter, transactionId: txn.id };
  });
}

export async function debitWallet(
  userId: number,
  amountCents: number,
  type: TransactionType,
  opts: {
    gameId?: number;
    betId?: number;
    description?: string;
    mpesaRef?: string;
    mpesaPhone?: string;
  } = {}
): Promise<DebitResult> {
  if (amountCents <= 0) {
    return { success: false, newBalanceCents: 0, transactionId: 0, error: 'Amount must be positive' };
  }

  return await db.transaction(async (tx) => {
    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .for('update');

    if (!wallet) throw new Error(`Wallet not found for user ${userId}`);

    const balanceBefore    = wallet.balanceCents;
    const availableBalance = balanceBefore - wallet.lockedCents;

    if (availableBalance < amountCents) {
      return {
        success: false, newBalanceCents: balanceBefore, transactionId: 0,
        error: `Insufficient balance. Available: KES ${(availableBalance / 100).toFixed(2)}`,
      };
    }

    const balanceAfter = balanceBefore - amountCents;

    await tx.update(wallets).set({
      balanceCents:   balanceAfter,
      totalWithdrawn: type === 'withdrawal' ? sql`${wallets.totalWithdrawn} + ${amountCents}` : wallets.totalWithdrawn,
      updatedAt:      new Date(),
    }).where(eq(wallets.userId, userId));

    const [txn] = await tx.insert(transactions).values({
      userId, type, status: 'completed',
      amountCents, balanceBefore, balanceAfter,
      gameId:      opts.gameId,
      betId:       opts.betId,
      description: opts.description,
      mpesaRef:    opts.mpesaRef,
      mpesaPhone:  opts.mpesaPhone,
      processedAt: new Date(),
    }).returning({ id: transactions.id });

    return { success: true, newBalanceCents: balanceAfter, transactionId: txn.id };
  });
}

export async function getBalance(userId: number): Promise<{ balanceCents: number; lockedCents: number } | null> {
  const [wallet] = await db
    .select({ balanceCents: wallets.balanceCents, lockedCents: wallets.lockedCents })
    .from(wallets)
    .where(eq(wallets.userId, userId));
  return wallet ?? null;
}

export async function createWallet(userId: number): Promise<void> {
  await db.insert(wallets).values({ userId, balanceCents: 0, lockedCents: 0 });
}
