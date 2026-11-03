import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SCRYPT_COST = { N: 16384, r: 8, p: 1 };

export function passwordStrengthError(password) {
  if (typeof password !== "string" || password.length < 15 || password.length > 256) {
    return "Use a password between 15 and 256 characters.";
  }

  const characterClasses = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/];
  if (characterClasses.filter((pattern) => pattern.test(password)).length < 3) {
    return "Use at least three of lowercase, uppercase, numbers, and symbols.";
  }

  return null;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, SCRYPT_COST);
  return `scrypt$${SCRYPT_COST.N}$${SCRYPT_COST.r}$${SCRYPT_COST.p}$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== "string") return false;
  const [algorithm, cost, blockSize, parallelism, saltHex, keyHex, extra] = storedHash.split("$");
  if (algorithm !== "scrypt" || cost !== "16384" || blockSize !== "8" || parallelism !== "1" || !saltHex || !keyHex || extra) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expectedKey = Buffer.from(keyHex, "hex");
  if (salt.length !== 16 || salt.toString("hex") !== saltHex || expectedKey.length !== KEY_LENGTH || expectedKey.toString("hex") !== keyHex) {
    return false;
  }

  const actualKey = await scrypt(password, salt, KEY_LENGTH, SCRYPT_COST);
  return timingSafeEqual(actualKey, expectedKey);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
