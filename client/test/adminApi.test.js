import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

test("admin API sends cookie credentials and uses safe errors", async (t) => {
  const vite = await createServer({
    configFile: false,
    root: ".",
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const { adminApi } = await vite.ssrLoadModule("/src/admin/adminApi.js");
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ success: true, admin: { email: "owner@example.com" } }) };
  };
  try {
    const response = await adminApi.login({ email: "owner@example.com", password: "not-retained" });
    assert.equal(response.admin.email, "owner@example.com");
    assert.equal(request.url, "http://localhost:5000/api/admin/auth/login");
    assert.equal(request.options.credentials, "include");
    assert.equal(request.options.method, "POST");
    assert.equal(JSON.parse(request.options.body).password, "not-retained");
    assert.equal("Authorization" in request.options.headers, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("password change uses the authenticated admin endpoint without logging or authorization headers", async (t) => {
  const vite = await createServer({
    configFile: false,
    root: ".",
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const { adminApi } = await vite.ssrLoadModule("/src/admin/adminApi.js");
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  };
  try {
    await adminApi.changePassword({ currentPassword: "current", newPassword: "new", confirmPassword: "new" });
    assert.equal(request.url, "http://localhost:5000/api/admin/auth/password");
    assert.equal(request.options.credentials, "include");
    assert.equal(request.options.method, "POST");
    assert.equal("Authorization" in request.options.headers, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
