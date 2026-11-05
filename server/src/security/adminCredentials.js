import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const LEGACY_SCRYPT = Object.freeze({ N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
const CURRENT_SCRYPT = Object.freeze({ N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
const HASH_PARAMETER_SETS = new Map([
  [`${LEGACY_SCRYPT.N}:${LEGACY_SCRYPT.r}:${LEGACY_SCRYPT.p}`, LEGACY_SCRYPT],
  [`${CURRENT_SCRYPT.N}:${CURRENT_SCRYPT.r}:${CURRENT_SCRYPT.p}`, CURRENT_SCRYPT],
]);
const MAX_CONCURRENT_SCRYPT_OPERATIONS = 2;
let activeScryptOperations = 0;

export class ScryptCapacityError extends Error {
  constructor() {
    super("Password hashing capacity is temporarily unavailable.");
    this.name = "ScryptCapacityError";
  }
}

async function deriveKey(password, salt, parameters) {
  if (activeScryptOperations >= MAX_CONCURRENT_SCRYPT_OPERATIONS) {
    throw new ScryptCapacityError();
  }

  activeScryptOperations += 1;
  try {
    return await scrypt(password, salt, KEY_LENGTH, parameters);
  } finally {
    activeScryptOperations -= 1;
  }
}

function parsePasswordHash(storedHash) {
  if (typeof storedHash !== "string") return null;

  const [algorithm, cost, blockSize, parallelism, saltHex, keyHex, extra] = storedHash.split("$");
  if (algorithm !== "scrypt" || extra !== undefined) return null;

  const parameters = HASH_PARAMETER_SETS.get(`${cost}:${blockSize}:${parallelism}`);
  if (!parameters || !/^[a-f0-9]{32}$/.test(saltHex || "") || !/^[a-f0-9]{128}$/.test(keyHex || "")) {
    return null;
  }

  return {
    parameters,
    salt: Buffer.from(saltHex, "hex"),
    expectedKey: Buffer.from(keyHex, "hex"),
  };
}

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
  const derivedKey = await deriveKey(password, salt, CURRENT_SCRYPT);
  return `scrypt$${CURRENT_SCRYPT.N}$${CURRENT_SCRYPT.r}$${CURRENT_SCRYPT.p}$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof password !== "string") return false;
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) return false;

  const actualKey = await deriveKey(password, parsed.salt, parsed.parameters);
  return timingSafeEqual(actualKey, parsed.expectedKey);
}

export function passwordHashNeedsRehash(storedHash) {
  const parsed = parsePasswordHash(storedHash);
  return Boolean(parsed && parsed.parameters.N !== CURRENT_SCRYPT.N);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
