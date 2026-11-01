import { createHash, randomBytes } from 'crypto';

const HOUSE_EDGE = 0.01;

export function generateGenesisSeed(): string {
  return randomBytes(32).toString('hex');
}

export function deriveNextHash(currentHash: string): string {
  return createHash('sha256').update(currentHash, 'utf8').digest('hex');
}

export function computeCrashPoint(hash: string): number {
  const MAX = 2 ** 32;
  const h   = parseInt(hash.substring(0, 8), 16);

  if (h % 33 === 0) return 100;

  const crashFloat = Math.floor((100 * MAX - h) / (MAX - h)) / 100;
  const crashX100  = Math.floor(Math.max(1.00, crashFloat) * 100);

  return crashX100;
}

export function verifyGame(hash: string, reportedCrashX100: number): boolean {
  return computeCrashPoint(hash) === reportedCrashX100;
}

export function verifyChainLink(currentHash: string, prevHash: string): boolean {
  return deriveNextHash(currentHash) === prevHash;
}

export function generateHashChain(count: number = 1000): string[] {
  const genesis = generateGenesisSeed();
  const chain: string[] = [];
  let current = genesis;
  for (let i = 0; i < count; i++) {
    current = deriveNextHash(current);
    chain.push(current);
  }
  return chain.reverse();
}

export function crashPointToElapsed(crashX100: number): number {
  const crash = crashX100 / 100;
  const K = 35000;
  return Math.round(Math.log(crash) * K);
}

export function elapsedToMultiplier(elapsedMs: number): number {
  const K = 35000;
  return Math.round(Math.exp(elapsedMs / K) * 100) / 100;
}

/** Apply the disclosed house-liquidity ceiling after the hash-derived RNG.
 * Amounts are integer KES cents; multiplier values are x100.
 * A cap below 1.00x deliberately becomes an instant bust at 1.00x.
 */
export function computeCappedCrashPoint(
  hash: string,
  totalRoundPoolCents: number,
  maxAllowedPayoutCents: number,
): number {
  const theoreticalCrashX100 = computeCrashPoint(hash);
  if (!Number.isSafeInteger(totalRoundPoolCents) || totalRoundPoolCents <= 0) {
    return theoreticalCrashX100;
  }
  if (!Number.isSafeInteger(maxAllowedPayoutCents) || maxAllowedPayoutCents < 0) {
    throw new Error('Invalid house risk ceiling');
  }
  const maxMultiplierX100 = Math.floor(
    (maxAllowedPayoutCents * 100) / totalRoundPoolCents,
  );
  if (maxMultiplierX100 < 100) return 100;
  return Math.min(theoreticalCrashX100, maxMultiplierX100);
}
