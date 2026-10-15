import test from "node:test";
import assert from "node:assert/strict";
import {
  computeCrashPoint,
  crashPointToElapsed,
  deriveNextHash,
  elapsedToMultiplier,
  generateGenesisSeed,
  generateHashChain,
  verifyChainLink,
  verifyGame,
} from "../lib/db/src/services/rng.service.ts";

test("genesis seeds are 32-byte hex strings", () => {
  assert.match(generateGenesisSeed(), /^[0-9a-f]{64}$/);
});

test("hash derivation is deterministic and produces SHA-256 hex", () => {
  const first = deriveNextHash("known-seed");
  assert.equal(first, deriveNextHash("known-seed"));
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, deriveNextHash("different-seed"));
});

test("hash-chain links verify in published chain order", () => {
  const chain = generateHashChain(12);
  assert.equal(chain.length, 12);
  for (let i = 1; i < chain.length; i++) {
    assert.equal(verifyChainLink(chain[i], chain[i - 1]), true);
  }
});

test("crash point is reproducible and verifiable from its hash", () => {
  const hashes = [
    "00000001" + "a".repeat(56),
    "12345678" + "b".repeat(56),
    "abcdef12" + "c".repeat(56),
    "ffffffff" + "d".repeat(56),
  ];
  for (const hash of hashes) {
    const crashX100 = computeCrashPoint(hash);
    assert.ok(Number.isInteger(crashX100));
    assert.ok(crashX100 >= 100);
    assert.equal(verifyGame(hash, crashX100), true);
    assert.equal(verifyGame(hash, crashX100 + 1), false);
  }
});

test("crash-time and multiplier conversions agree within rounding tolerance", () => {
  for (const crashX100 of [100, 150, 200, 500, 1000, 2500, 10000]) {
    const elapsed = crashPointToElapsed(crashX100);
    const reconstructed = elapsedToMultiplier(elapsed);
    assert.ok(
      Math.abs(reconstructed - crashX100 / 100) <= 0.02,
      `expected ~${crashX100 / 100}x, received ${reconstructed}x`,
    );
  }
});
