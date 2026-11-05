import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import Admin from "../src/models/Admin.js";
import AdminSession from "../src/models/AdminSession.js";
import { changeAdminPassword, loginAdmin } from "../src/controllers/adminAuthController.js";
import { requireAdmin } from "../src/middleware/adminAuth.js";
import { hashPassword, verifyPassword } from "../src/security/adminCredentials.js";

const scrypt = promisify(scryptCallback);

const currentPassword = "Str0ng!Passphrase#2026";
const nextPasswordA = "N3w!SecurePassphrase#2026";
const nextPasswordB = "An0ther!SecurePassphrase#2026";
const email = "owner@example.com";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function responseRecorder() {
  return {
    statusCode: 200, body: null, cookies: [], clearedCookies: [], headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
    clearCookie(name, options) { this.clearedCookies.push({ name, options }); return this; },
    set(name, value) { this.headers[name] = value; return this; },
  };
}

function installPersistence(t, initialState) {
  const originals = [
    [Admin, "findOne"], [Admin, "findById"], [Admin, "exists"], [Admin, "updateOne"],
    [AdminSession, "create"], [AdminSession, "findOne"], [AdminSession, "deleteOne"], [AdminSession, "deleteMany"],
  ].map(([model, key]) => [model, key, model[key]]);
  t.after(() => originals.forEach(([model, key, original]) => { model[key] = original; }));

  const state = { ...initialState };
  const sessions = [];
  const versionMatches = (filter) => {
    const versionOr = filter.$or;
    if (versionOr) return (state.credentialVersion ?? 0) === 0;
    return filter.credentialVersion === undefined || (state.credentialVersion ?? 0) === filter.credentialVersion;
  };
  Admin.findOne = () => ({ select: async () => state.isActive ? { ...state } : null });
  Admin.findById = () => ({ select: async () => ({ ...state }) });
  Admin.exists = async (filter) => filter._id === state._id && versionMatches(filter) ? { _id: state._id } : null;
  Admin.updateOne = async (filter, update) => {
    if (filter._id !== state._id || (filter.passwordHash && filter.passwordHash !== state.passwordHash) || !versionMatches(filter)) {
      return { matchedCount: 0 };
    }
    if (update.$set?.passwordHash) state.passwordHash = update.$set.passwordHash;
    if (update.$inc?.credentialVersion) state.credentialVersion = (state.credentialVersion ?? 0) + update.$inc.credentialVersion;
    return { matchedCount: 1 };
  };
  AdminSession.create = async (session) => {
    const saved = { ...session, _id: `session-${sessions.length + 1}` };
    sessions.push(saved);
    return saved;
  };
  AdminSession.deleteOne = async ({ _id }) => {
    const index = sessions.findIndex((entry) => entry._id === _id);
    if (index >= 0) sessions.splice(index, 1);
    return { deletedCount: index >= 0 ? 1 : 0 };
  };
  AdminSession.findOne = (query) => ({ populate: async () => {
    const found = sessions.find((entry) => entry.tokenHash === query.tokenHash && entry.expiresAt > query.expiresAt.$gt);
    return found ? { ...found, adminId: { ...state } } : null;
  } });
  AdminSession.deleteMany = async (filter) => {
    const before = sessions.length;
    for (let i = sessions.length - 1; i >= 0; i -= 1) {
      if (sessions[i].adminId === filter.adminId && sessions[i].credentialVersion !== state.credentialVersion) sessions.splice(i, 1);
    }
    return { deletedCount: before - sessions.length };
  };
  return { state, sessions };
}

async function requestLogin(password) {
  const res = responseRecorder();
  await loginAdmin({ body: { email, password } }, res);
  return res;
}

async function requestPasswordChange(password, adminVersion = 0) {
  const res = responseRecorder();
  await changeAdminPassword({
    admin: { id: "admin-id", credentialVersion: adminVersion },
    body: { currentPassword, newPassword: password, confirmPassword: password },
  }, res);
  return res;
}

async function authenticateCookie(cookie) {
  const res = responseRecorder();
  let allowed = false;
  await requireAdmin({ headers: { cookie } }, res, () => { allowed = true; });
  return { allowed, res };
}

async function createLegacyHash(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}

test("Scenario A: login verified with old password cannot complete after password change", async (t) => {
  const legacyHash = await createLegacyHash(currentPassword);
  const persistence = installPersistence(t, {
    _id: "admin-id", email, passwordHash: legacyHash,
    credentialVersion: 0, isActive: true, role: "admin",
  });
  const verifiedBeforeMigration = deferred();
  const resumeLogin = deferred();
  const originalUpdate = Admin.updateOne;
  Admin.updateOne = async (filter, update) => {
    if (update.$set?.passwordHash && !update.$inc) {
      verifiedBeforeMigration.resolve();
      await resumeLogin.promise;
    }
    return originalUpdate(filter, update);
  };

  const loginPromise = requestLogin(currentPassword);
  await verifiedBeforeMigration.promise;
  const changed = await requestPasswordChange(nextPasswordA);
  assert.equal(changed.statusCode, 200);
  resumeLogin.resolve();
  const login = await loginPromise;
  assert.equal(login.statusCode, 503);
  assert.equal(persistence.sessions.length, 0);
  assert.equal(await verifyPassword(nextPasswordA, persistence.state.passwordHash), true);
});

test("Scenario B: old password fails and new password succeeds after a password change", async (t) => {
  const persistence = installPersistence(t, {
    _id: "admin-id", email, passwordHash: await hashPassword(currentPassword),
    credentialVersion: 0, isActive: true, role: "admin",
  });
  assert.equal((await requestPasswordChange(nextPasswordA)).statusCode, 200);
  const oldLogin = await requestLogin(currentPassword);
  assert.equal(oldLogin.statusCode, 401);
  const newLogin = await requestLogin(nextPasswordA);
  assert.equal(newLogin.statusCode, 200);
  assert.equal(persistence.sessions[0].credentialVersion, 1);
  assert.equal(await verifyPassword(nextPasswordA, persistence.state.passwordHash), true);
});

test("Scenario C: an existing session is rejected after password change even if its row remains", async (t) => {
  const persistence = installPersistence(t, {
    _id: "admin-id", email, passwordHash: await hashPassword(currentPassword),
    credentialVersion: 0, isActive: true, role: "admin",
  });
  const login = await requestLogin(currentPassword);
  assert.equal(login.statusCode, 200);
  const token = login.cookies[0].value;
  AdminSession.deleteMany = async () => ({ deletedCount: 0 });
  assert.equal((await requestPasswordChange(nextPasswordA)).statusCode, 200);
  assert.equal(persistence.sessions.length, 1);
  const auth = await authenticateCookie(`attelier_admin_session=${token}`);
  assert.equal(auth.allowed, false);
  assert.equal(auth.res.statusCode, 401);
});

test("Scenario D: session inserted after revocation carries a stale version and cannot authenticate", async (t) => {
  const persistence = installPersistence(t, {
    _id: "admin-id", email, passwordHash: await hashPassword(currentPassword),
    credentialVersion: 0, isActive: true, role: "admin",
  });
  const versionChecked = deferred();
  const resumeCreate = deferred();
  const originalCreate = AdminSession.create;
  AdminSession.create = async (session) => {
    versionChecked.resolve();
    const saved = await originalCreate(session);
    await resumeCreate.promise;
    return saved;
  };

  const loginPromise = requestLogin(currentPassword);
  await versionChecked.promise;
  AdminSession.deleteMany = async () => ({ deletedCount: 0 });
  assert.equal((await requestPasswordChange(nextPasswordA)).statusCode, 200);
  AdminSession.deleteOne = async () => { throw new Error("simulate cleanup failure while version check remains authoritative"); };
  resumeCreate.resolve();
  const login = await loginPromise;
  assert.equal(login.statusCode, 503);
  assert.equal(login.cookies.length, 0);
  assert.equal(persistence.sessions[0].credentialVersion, 0);
  AdminSession.findOne = () => ({ populate: async () => ({
    ...persistence.sessions[0],
    adminId: { ...persistence.state },
  }) });
  const auth = await authenticateCookie("attelier_admin_session=stale-session-token");
  assert.equal(auth.allowed, false);
  assert.equal(auth.res.statusCode, 401);
});

test("Scenario E: concurrent password changes use compare-and-set so one cannot overwrite the other", async (t) => {
  const persistence = installPersistence(t, {
    _id: "admin-id", email, passwordHash: await hashPassword(currentPassword),
    credentialVersion: 0, isActive: true, role: "admin",
  });
  const [first, second] = await Promise.all([
    requestPasswordChange(nextPasswordA),
    requestPasswordChange(nextPasswordB),
  ]);
  assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 409]);
  assert.equal(persistence.state.credentialVersion, 1);
  assert.equal(await verifyPassword(nextPasswordA, persistence.state.passwordHash)
    || await verifyPassword(nextPasswordB, persistence.state.passwordHash), true);
});

test("Scenario F: legacy hash migration cannot overwrite a concurrent credential change", async (t) => {
  const legacyPasswordHash = await createLegacyHash(currentPassword);
  const replacementHash = await hashPassword(nextPasswordA);
  const persistence = installPersistence(t, {
    _id: "admin-id", email, passwordHash: legacyPasswordHash,
    credentialVersion: 0, isActive: true, role: "admin",
  });
  const originalUpdate = Admin.updateOne;
  Admin.updateOne = async (filter, update) => {
    if (update.$set?.passwordHash && !update.$inc) {
      persistence.state.passwordHash = replacementHash;
      persistence.state.credentialVersion = 1;
      return { matchedCount: 0 };
    }
    return originalUpdate(filter, update);
  };
  const login = await requestLogin(currentPassword);
  assert.equal(login.statusCode, 503);
  assert.equal(persistence.state.passwordHash, replacementHash);
  assert.equal(await verifyPassword(nextPasswordA, persistence.state.passwordHash), true);
  assert.equal(persistence.sessions.length, 0);
});

test("Scenario G: credential update failure is atomic and session creation failure issues no cookie", async (t) => {
  const persistence = installPersistence(t, {
    _id: "admin-id", email, passwordHash: await hashPassword(currentPassword),
    credentialVersion: 0, isActive: true, role: "admin",
  });
  const originalUpdate = Admin.updateOne;
  Admin.updateOne = async () => { throw new Error("mock database failure"); };
  const failedChange = await requestPasswordChange(nextPasswordA);
  assert.equal(failedChange.statusCode, 503);
  assert.equal(persistence.state.credentialVersion, 0);
  assert.equal(await verifyPassword(currentPassword, persistence.state.passwordHash), true);
  Admin.updateOne = originalUpdate;

  AdminSession.create = async () => { throw new Error("mock session insert failure"); };
  const failedLogin = await requestLogin(currentPassword);
  assert.equal(failedLogin.statusCode, 503);
  assert.equal(failedLogin.cookies.length, 0);
});
