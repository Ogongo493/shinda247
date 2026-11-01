import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCappedCrashPoint, computeCrashPoint } from '../src/services/rng.service.ts';

test('a cap below 1.00x forces an instant bust at 1.00x', () => {
  assert.equal(computeCappedCrashPoint('ffffffff', 10000, 5000), 100);
});

test('the liquidity cap limits a high theoretical crash point', () => {
  const hash = 'ffffffff';
  const theoretical = computeCrashPoint(hash);
  assert.ok(theoretical > 200);
  assert.equal(computeCappedCrashPoint(hash, 10000, 20000), 200);
});

test('theoretical RNG result is unchanged when there is no round pool', () => {
  const hash = '12345678';
  assert.equal(computeCappedCrashPoint(hash, 0, 5000), computeCrashPoint(hash));
});

test('invalid reserve ceilings are rejected', () => {
  assert.throws(() => computeCappedCrashPoint('ffffffff', 10000, -1));
});
