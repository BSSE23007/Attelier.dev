import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import Admin from "../src/models/Admin.js";
import AdminSession from "../src/models/AdminSession.js";
import app from "../src/app.js";
import { changeAdminPassword, getAdminSession, loginAdmin, logoutAdmin } from "../src/controllers/adminAuthController.js";
import { adminCookieOptions, requireAdmin, requireTrustedOrigin } from "../src/middleware/adminAuth.js";
import { hashPassword, passwordStrengthError, verifyPassword } from "../src/security/adminCredentials.js";

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

function withRestoredMethods(t, entries) {
  const originals = entries.map(([object, name]) => [object, name, object[name]]);
  t.after(() => originals.forEach(([object, name, original]) => { object[name] = original; }));
}

test("hashes passwords with scrypt and rejects weak provisioning passwords", async () => {
  assert.match(passwordStrengthError("weak"), /15 and 256/);
  assert.equal(passwordStrengthError(validPassword), null);
  const hash = await hashPassword(validPassword);
  assert.notEqual(hash, validPassword);
  assert.match(hash, /^scrypt\$16384\$8\$1\$[a-f0-9]+\$[a-f0-9]+$/);
});

test("successful login creates a hashed server session and HttpOnly cookie", async (t) => {
  withRestoredMethods(t, [[Admin, "findOne"], [AdminSession, "create"]]);
  const passwordHash = await hashPassword(validPassword);
  const admin = { _id: "admin-id", email: validEmail, passwordHash, isActive: true, role: "admin" };
  let savedSession;
  Admin.findOne = () => ({ select: async () => admin });
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
  withRestoredMethods(t, [[Admin, "findOne"]]);
  let lookups = 0;
  const passwordHash = await hashPassword(validPassword);
  Admin.findOne = () => { lookups += 1; return { select: async () => ({ email: validEmail, passwordHash, isActive: true, role: "admin" }) }; };

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
  withRestoredMethods(t, [[Admin, "findById"], [AdminSession, "deleteMany"]]);
  const oldHash = await hashPassword(validPassword);
  const newPassword = "N3w!SecurePassphrase#2026";
  const admin = {
    _id: "admin-id", passwordHash: oldHash, isActive: true, role: "admin",
    async save() { this.saved = true; },
  };
  let deletedSessions;
  Admin.findById = () => ({ select: async () => admin });
  AdminSession.deleteMany = async (filter) => { deletedSessions = filter; return { deletedCount: 2 }; };

  const res = responseRecorder();
  await changeAdminPassword({
    admin: { id: "admin-id" },
    body: { currentPassword: validPassword, newPassword, confirmPassword: newPassword },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(admin.saved, true);
  assert.notEqual(admin.passwordHash, oldHash);
  assert.equal(await verifyPassword(newPassword, admin.passwordHash), true);
  assert.deepEqual(deletedSessions, { adminId: "admin-id" });
  assert.equal(res.clearedCookies[0].name, "attelier_admin_session");
  assert.deepEqual(res.body, { success: true, message: "Password changed. Sign in again with your new password." });
  assert.equal(JSON.stringify(res.body).includes("passwordHash"), false);
});

test("rejects an incorrect current password without changing the account or sessions", async (t) => {
  withRestoredMethods(t, [[Admin, "findById"], [AdminSession, "deleteMany"]]);
  const admin = { _id: "admin-id", passwordHash: await hashPassword(validPassword), isActive: true, role: "admin", save: async () => assert.fail("must not save") };
  Admin.findById = () => ({ select: async () => admin });
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
  withRestoredMethods(t, [[Admin, "findOne"]]);
  Admin.findOne = () => ({ select: async () => null });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/admin/auth/login`;
  let lastResponse;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    lastResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
      body: JSON.stringify({ email: validEmail, password: "incorrect" }),
    });
    if (attempt < 10) assert.equal(lastResponse.status, 401);
  }
  assert.equal(lastResponse.status, 429);
});
