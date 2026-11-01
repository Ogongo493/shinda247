import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  createTotpSecret,
  encryptTotpSecret,
  decryptTotpSecret,
  verifyTotp,
} from "../artifacts/api-server/src/lib/admin-totp.ts";

process.env.ADMIN_TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 0x5a).toString("base64");

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function decodeBase32(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function currentCode(secret: string, timeMs: number): string {
  const counter = Math.floor(timeMs / 30000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

test("authenticator secrets are strong base32 values", () => {
  const secret = createTotpSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
});

test("authenticator secrets are encrypted at rest and decrypt correctly", () => {
  const secret = createTotpSecret();
  const encrypted = encryptTotpSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptTotpSecret(encrypted), secret);
});

test("TOTP matches the RFC 6238 SHA-1 six-digit reference vector", () => {
  // RFC 6238 test secret, time 59 seconds, 6-digit SHA-1 TOTP.
  assert.equal(verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 59000), true);
});

test("TOTP accepts a valid six-digit code and rejects invalid codes", () => {
  const secret = createTotpSecret();
  const time = Math.floor(Date.now() / 30000) * 30000 + 15000;
  const code = currentCode(secret, time);
  assert.equal(verifyTotp(secret, code, time), true);
  assert.equal(verifyTotp(secret, "abcdef", time), false);
  assert.equal(verifyTotp(secret, "123", time), false);
});
