import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { createServer } from "node:http";
import Admin from "../src/models/Admin.js";
import AdminSession from "../src/models/AdminSession.js";
import app from "../src/app.js";
import { changeAdminPassword, getAdminSession, loginAdmin, logoutAdmin } from "../src/controllers/adminAuthController.js";
import { adminCookieOptions, requireAdmin, requireTrustedOrigin } from "../src/middleware/adminAuth.js";
import { hashPassword, passwordHashNeedsRehash, passwordStrengthError, verifyPassword } from "../src/security/adminCredentials.js";

const scrypt = promisify(scryptCallback);

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    cookies: [],
    clearedCookies: [],
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
    clearCookie(name, options) { this.clearedCookies.push({ name, options }); return this; },
    set(name, value) { this.headers[name] = value; return this; },
  };
}

const validPassword = "Str0ng!Passphrase#2026";
const validEmail = "owner@example.com";
const legacyScrypt = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };

async function createLegacyPasswordHash(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64, legacyScrypt);
  return `scrypt$16384$8$1$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

function withRestoredMethods(t, entries) {
  const originals = entries.map(([object, name]) => [object, name, object[name]]);
  t.after(() => originals.forEach(([object, name, original]) => { object[name] = original; }));
}

test("hashes new passwords with current scrypt parameters and rejects weak provisioning passwords", async () => {
  assert.match(passwordStrengthError("weak"), /15 and 256/);
  assert.equal(passwordStrengthError(validPassword), null);
  const hash = await hashPassword(validPassword);
  assert.notEqual(hash, validPassword);
  assert.match(hash, /^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  assert.equal(await verifyPassword(validPassword, hash), true);
  assert.equal(passwordHashNeedsRehash(hash), false);
});

test("verifies legacy hashes and rejects wrong passwords, malformed hashes, unsupported parameters, and plaintext", async () => {
  const legacyHash = await createLegacyPasswordHash(validPassword);
  assert.equal(await verifyPassword(validPassword, legacyHash), true);
  assert.equal(passwordHashNeedsRehash(legacyHash), true);
  assert.equal(await verifyPassword("incorrect", legacyHash), false);
  assert.equal(await verifyPassword(validPassword, "not-a-password-hash"), false);
  assert.equal(await verifyPassword(validPassword, validPassword), false);

  const fields = legacyHash.split("$");
  assert.equal(await verifyPassword(validPassword, `scrypt-v2$${fields.slice(1).join("$")}`), false);
  assert.equal(await verifyPassword(validPassword, `scrypt$65536$8$1$${fields.slice(4).join("$")}`), false);
  assert.equal(await verifyPassword(validPassword, `scrypt$16384$8$1$${"0".repeat(31)}$${"0".repeat(128)}`), false);
});

test("successful legacy login rehashes before creating a session without changing the password or exposing the hash", async (t) => {
  withRestoredMethods(t, [[Admin, "findOne"], [Admin, "updateOne"], [Admin, "exists"], [AdminSession, "create"]]);
  const legacyHash = await createLegacyPasswordHash(validPassword);
  let persistedHash = legacyHash;
  const admin = { _id: "admin-id", email: validEmail, get passwordHash() { return persistedHash; }, isActive: true, role: "admin" };
  const order = [];
  let updateFilter;
  let createdSession = false;
  Admin.findOne = () => ({ select: async () => admin });
  Admin.updateOne = async (filter, update) => {
    updateFilter = filter;
    persistedHash = update.$set.passwordHash;
    order.push("hash-updated");
    return { matchedCount: 1, modifiedCount: 1 };
  };
  Admin.exists = async () => ({ _id: "admin-id" });
  AdminSession.create = async () => {
    createdSession = true;
    order.push("session-created");
  };

  const res = responseRecorder();
  await loginAdmin({ body: { email: validEmail, password: validPassword } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(order, ["hash-updated", "session-created"]);
  assert.deepEqual(updateFilter, {
    _id: "admin-id", passwordHash: legacyHash,
    $or: [{ credentialVersion: 0 }, { credentialVersion: { $exists: false } }],
  });
  assert.equal(persistedHash.split("$")[1], "131072");
  assert.equal(await verifyPassword(validPassword, persistedHash), true);
  assert.equal(createdSession, true);
  assert.equal("passwordHash" in res.body, false);
  assert.equal(JSON.stringify(res.body).includes(persistedHash), false);
});

test("incorrect legacy password does not rehash or create a session", async (t) => {
  withRestoredMethods(t, [[Admin, "findOne"], [Admin, "updateOne"], [Admin, "exists"], [AdminSession, "create"]]);
  const legacyHash = await createLegacyPasswordHash(validPassword);
  Admin.findOne = () => ({ select: async () => ({
    _id: "admin-id", email: validEmail, passwordHash: legacyHash, isActive: true, role: "admin",
  }) });
  Admin.updateOne = async () => assert.fail("wrong password must not trigger rehash");
  Admin.exists = async () => assert.fail("wrong password must not check or create a session");
  AdminSession.create = async () => assert.fail("wrong password must not create a session");

  const res = responseRecorder();
  await loginAdmin({ body: { email: validEmail, password: "incorrect" } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, "Email or password is incorrect.");
});

test("current-strength hash is not rehashed at login", async (t) => {
  withRestoredMethods(t, [[Admin, "findOne"], [Admin, "updateOne"], [Admin, "exists"], [AdminSession, "create"]]);
  const currentHash = await hashPassword(validPassword);
  let sessionsCreated = 0;
  Admin.findOne = () => ({ select: async () => ({
    _id: "admin-id", email: validEmail, passwordHash: currentHash, isActive: true, role: "admin",
  }) });
  Admin.updateOne = async () => assert.fail("current-strength hash must not be rewritten");
  Admin.exists = async () => ({ _id: "admin-id" });
  AdminSession.create = async () => { sessionsCreated += 1; };

  const res = responseRecorder();
  await loginAdmin({ body: { email: validEmail, password: validPassword } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(sessionsCreated, 1);
});

test("legacy hash migration failure returns a safe error and creates no session", async (t) => {
  withRestoredMethods(t, [[Admin, "findOne"], [Admin, "updateOne"], [Admin, "exists"], [AdminSession, "create"]]);
  const legacyHash = await createLegacyPasswordHash(validPassword);
  Admin.findOne = () => ({ select: async () => ({
    _id: "admin-id", email: validEmail, passwordHash: legacyHash, isActive: true, role: "admin",
  }) });
  Admin.updateOne = async () => { throw new Error("mock migration failure"); };
  Admin.exists = async () => assert.fail("must not check version after failed migration");
  AdminSession.create = async () => assert.fail("session must not be created if rehash persistence fails");

  const res = responseRecorder();
  await loginAdmin({ body: { email: validEmail, password: validPassword } }, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { success: false, message: "Unable to sign in right now." });
});

test("successful login creates a hashed server session and HttpOnly cookie", async (t) => {
  withRestoredMethods(t, [[Admin, "findOne"], [Admin, "exists"], [AdminSession, "create"]]);
  const passwordHash = await hashPassword(validPassword);
  const admin = { _id: "admin-id", email: validEmail, passwordHash, isActive: true, role: "admin" };
  let savedSession;
  Admin.findOne = () => ({ select: async () => admin });
  Admin.exists = async () => ({ _id: "admin-id" });
  AdminSession.create = async (session) => { savedSession = session; return session; };

  const res = responseRecorder();
  await loginAdmin({ body: { email: ` ${validEmail.toUpperCase()} `, password: validPassword } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.admin.email, validEmail);
  assert.equal(res.cookies.length, 1);
  assert.equal(res.cookies[0].options.httpOnly, true);
  assert.equal(res.cookies[0].name, "attelier_admin_session");
  assert.notEqual(savedSession.tokenHash, res.cookies[0].value);
  assert.match(savedSession.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal("passwordHash" in res.body, false);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("rejects invalid email and password without revealing whether the account exists", async (t) => {
  withRestoredMethods(t, [[Admin, "findOne"], [Admin, "exists"]]);
  let lookups = 0;
  const passwordHash = await hashPassword(validPassword);
  Admin.findOne = () => { lookups += 1; return { select: async () => ({ email: validEmail, passwordHash, isActive: true, role: "admin" }) }; };
  Admin.exists = async () => ({ _id: "admin-id" });

  const invalidEmail = responseRecorder();
  await loginAdmin({ body: { email: "not-an-email", password: validPassword } }, invalidEmail);
  assert.equal(invalidEmail.statusCode, 400);
  assert.equal(lookups, 0);

  const invalidPassword = responseRecorder();
  await loginAdmin({ body: { email: validEmail, password: "incorrect" } }, invalidPassword);
  assert.equal(invalidPassword.statusCode, 401);
  assert.equal(invalidPassword.body.message, "Email or password is incorrect.");
});

test("rejects an expired or missing session", async (t) => {
  withRestoredMethods(t, [[AdminSession, "findOne"]]);
  let sessionQuery;
  AdminSession.findOne = (query) => {
    sessionQuery = query;
    return { populate: async () => null };
  };
  const res = responseRecorder();
  let continued = false;
  await requireAdmin({ headers: { cookie: "attelier_admin_session=opaque-token" } }, res, () => { continued = true; });

  assert.equal(continued, false);
  assert.equal(res.statusCode, 401);
  assert.ok(sessionQuery.expiresAt.$gt instanceof Date);
  assert.equal(res.clearedCookies[0].name, "attelier_admin_session");
});

test("rejects untrusted origins on admin mutations", () => {
  const res = responseRecorder();
  let continued = false;
  requireTrustedOrigin({ get: () => "https://attacker.example" }, res, () => { continued = true; });
  assert.equal(continued, false);
  assert.equal(res.statusCode, 403);
});

test("uses HttpOnly, scoped cookies with Secure and SameSite=None in production", (t) => {
  const originalMode = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  t.after(() => {
    if (originalMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalMode;
  });
  const options = adminCookieOptions();
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, "none");
  assert.equal(options.path, "/api/admin");
});

test("returns the authenticated administrator without exposing session data", async () => {
  const res = responseRecorder();
  const expiresAt = new Date(Date.now() + 60_000);
  await getAdminSession({ admin: { email: validEmail, id: "admin-id" }, adminSessionExpiresAt: expiresAt }, res);
  assert.deepEqual(res.body, { success: true, admin: { email: validEmail }, expiresAt });
});

test("changes the password after verifying the current password and invalidates every existing session", async (t) => {
  withRestoredMethods(t, [[Admin, "findById"], [Admin, "updateOne"], [AdminSession, "deleteMany"]]);
  const oldHash = await hashPassword(validPassword);
  const newPassword = "N3w!SecurePassphrase#2026";
  const admin = {
    _id: "admin-id", passwordHash: oldHash, credentialVersion: 0, isActive: true, role: "admin",
  };
  let deletedSessions;
  Admin.findById = () => ({ select: async () => admin });
  Admin.updateOne = async (filter, update) => {
    assert.deepEqual(filter, { _id: "admin-id", passwordHash: oldHash, $or: [{ credentialVersion: 0 }, { credentialVersion: { $exists: false } }] });
    admin.passwordHash = update.$set.passwordHash;
    admin.credentialVersion += update.$inc.credentialVersion;
    return { matchedCount: 1 };
  };
  AdminSession.deleteMany = async (filter) => { deletedSessions = filter; return { deletedCount: 2 }; };

  const res = responseRecorder();
  await changeAdminPassword({
    admin: { id: "admin-id", credentialVersion: 0 },
    body: { currentPassword: validPassword, newPassword, confirmPassword: newPassword },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.notEqual(admin.passwordHash, oldHash);
  assert.equal(admin.credentialVersion, 1);
  assert.equal(admin.passwordHash.split("$")[1], "131072");
  assert.equal(await verifyPassword(newPassword, admin.passwordHash), true);
  assert.deepEqual(deletedSessions, { adminId: "admin-id", credentialVersion: { $ne: 1 } });
  assert.equal(res.clearedCookies[0].name, "attelier_admin_session");
  assert.deepEqual(res.body, { success: true, message: "Password changed. Sign in again with your new password." });
  assert.equal(JSON.stringify(res.body).includes("passwordHash"), false);
});

test("rejects an incorrect current password without changing the account or sessions", async (t) => {
  withRestoredMethods(t, [[Admin, "findById"], [Admin, "updateOne"], [AdminSession, "deleteMany"]]);
  const admin = { _id: "admin-id", passwordHash: await hashPassword(validPassword), credentialVersion: 0, isActive: true, role: "admin" };
  Admin.findById = () => ({ select: async () => admin });
  Admin.updateOne = async () => assert.fail("must not change credentials");
  AdminSession.deleteMany = async () => assert.fail("must not revoke sessions");

  const res = responseRecorder();
  await changeAdminPassword({ admin: { id: "admin-id" }, body: { currentPassword: "incorrect", newPassword: "N3w!SecurePassphrase#2026", confirmPassword: "N3w!SecurePassphrase#2026" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Current password is incorrect.");
});

test("rejects weak new passwords before querying the administrator", async (t) => {
  withRestoredMethods(t, [[Admin, "findById"]]);
  Admin.findById = () => assert.fail("must not query before policy validation");
  const res = responseRecorder();
  await changeAdminPassword({ admin: { id: "admin-id" }, body: { currentPassword: validPassword, newPassword: "weak", confirmPassword: "weak" } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /15 and 256/);
});

test("rejects password confirmation mismatch", async (t) => {
  withRestoredMethods(t, [[Admin, "findById"]]);
  Admin.findById = () => assert.fail("must not query when confirmation differs");
  const res = responseRecorder();
  await changeAdminPassword({ admin: { id: "admin-id" }, body: { currentPassword: validPassword, newPassword: "N3w!SecurePassphrase#2026", confirmPassword: "Different!Passphrase#2026" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "The new password and confirmation do not match.");
});

test("logout deletes the current session and clears its cookie", async (t) => {
  withRestoredMethods(t, [[AdminSession, "deleteOne"], [AdminSession, "findOne"]]);
  let deleted;
  let active = true;
  const session = { _id: "session-id", adminId: { _id: "admin-id", email: validEmail, role: "admin", isActive: true } };
  AdminSession.findOne = () => ({ populate: async () => active ? session : null });
  AdminSession.deleteOne = async (filter) => { deleted = filter; active = false; };
  let allowed = false;
  await requireAdmin({ headers: { cookie: "attelier_admin_session=opaque-token" } }, responseRecorder(), () => { allowed = true; });
  assert.equal(allowed, true);

  const res = responseRecorder();
  await logoutAdmin({ adminSessionId: "session-id" }, res);
  assert.deepEqual(deleted, { _id: "session-id" });
  assert.equal(res.clearedCookies[0].name, "attelier_admin_session");
  assert.equal("maxAge" in res.clearedCookies[0].options, false);
  assert.equal(res.body.success, true);

  const afterLogout = responseRecorder();
  await requireAdmin({ headers: { cookie: "attelier_admin_session=opaque-token" } }, afterLogout, () => { allowed = true; });
  assert.equal(afterLogout.statusCode, 401);
});

test("admin API rejects unauthenticated requests", async (t) => {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/overview`);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).success, false);
});

test("rejects unauthenticated password changes", async (t) => {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/auth/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: JSON.stringify({ currentPassword: validPassword, newPassword: validPassword, confirmPassword: validPassword }),
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).success, false);
});

test("login route rate limits repeated attempts", async (t) => {
  withRestoredMethods(t, [[Admin, "findOne"], [Admin, "exists"]]);
  Admin.findOne = () => ({ select: async () => null });
  Admin.exists = async () => null;
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/admin/auth/login`;
  let lastResponse;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    lastResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ email: validEmail, password: "incorrect" }),
    });
    if (attempt < 10) assert.equal(lastResponse.status, 401);
  }
  assert.equal(lastResponse.status, 429);
  assert.match(lastResponse.headers.get("ratelimit"), /"10-in-15min"; r=0/);
  assert.equal(lastResponse.headers.get("x-ratelimit-limit"), null);
  assert.deepEqual(await lastResponse.json(), { success: false, message: "Too many login attempts. Please wait and try again." });
});

test("password change route enforces its per-IP limit and retains its response", async (t) => {
  withRestoredMethods(t, [[AdminSession, "findOne"]]);
  AdminSession.findOne = () => ({ populate: async () => ({
    _id: "session-id",
    credentialVersion: 0,
    expiresAt: new Date(Date.now() + 60_000),
    adminId: { _id: "admin-id", email: validEmail, role: "admin", isActive: true, credentialVersion: 0 },
  }) });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/admin/auth/password`;
  let lastResponse;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    lastResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
        Cookie: "attelier_admin_session=opaque-token",
      },
      body: JSON.stringify({}),
    });
    if (attempt < 5) assert.equal(lastResponse.status, 400);
  }
  assert.equal(lastResponse.status, 429);
  assert.match(lastResponse.headers.get("ratelimit"), /"5-in-15min"; r=0/);
  assert.deepEqual(await lastResponse.json(), { success: false, message: "Too many password change attempts. Please wait and try again." });
});
