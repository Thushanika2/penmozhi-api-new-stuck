const crypto = require("node:crypto");
const { promisify } = require("node:util");
const bcrypt = require("bcryptjs");

const scrypt = promisify(crypto.scrypt);
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, 64, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 128 * 1024 * 1024,
  });
  // Werkzeug's scrypt representation is intentionally used so migrated and
  // newly-created accounts follow the same password format.
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}$${salt}$${Buffer.from(derived).toString("hex")}`;
}

function safeEqual(left, right) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function verifyWerkzeugHash(stored, password) {
  if (!stored || typeof stored !== "string") return false;

  // Older deployments may already contain bcrypt hashes.
  if (/^\$2[aby]?\$/.test(stored)) return bcrypt.compare(password, stored);

  const [method, salt, expected] = stored.split("$");
  if (!method || !salt || !expected) return false;

  if (method.startsWith("scrypt:")) {
    const [, n, r, p] = method.split(":").map(Number);
    if (![n, r, p].every(Number.isFinite)) return false;
    const derived = await scrypt(password, salt, Buffer.from(expected, "hex").length, {
      N: n,
      r,
      p,
      maxmem: Math.max(128 * 1024 * 1024, 128 * n * r * 2),
    });
    return safeEqual(Buffer.from(derived).toString("hex"), expected);
  }

  if (method.startsWith("pbkdf2:")) {
    const [, digest, iterationsText] = method.split(":");
    const iterations = Number(iterationsText);
    if (!digest || !Number.isFinite(iterations)) return false;
    const derived = crypto.pbkdf2Sync(
      password,
      salt,
      iterations,
      Buffer.from(expected, "hex").length,
      digest,
    );
    return safeEqual(derived.toString("hex"), expected);
  }

  return false;
}

module.exports = { hashPassword, verifyWerkzeugHash };
