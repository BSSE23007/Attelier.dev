import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { gzipSync } from "node:zlib";
import Admin from "../src/models/Admin.js";
import AdminSession from "../src/models/AdminSession.js";
import Inquiry from "../src/models/Inquiry.js";
import app from "../src/app.js";
import { hashPassword } from "../src/security/adminCredentials.js";

const allowedOrigin = "http://localhost:5173";

function startServer(t, application = app) {
  const server = application.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", () => resolve({
      server,
      baseUrl: `http://127.0.0.1:${server.address().port}`,
    }));
  });
}

function postJson(baseUrl, path, body, headers = {}) {
  const payload = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = request(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": payload.length, ...headers },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.setTimeout(4000, () => req.destroy(new Error("Local HTTP request timed out.")));
    req.once("error", reject);
    req.end(payload);
  });
}

function getResponse(baseUrl, path) {
  return new Promise((resolve, reject) => {
    const req = request(`${baseUrl}${path}`, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.setTimeout(4000, () => req.destroy(new Error("Local HTTP request timed out.")));
    req.once("error", reject);
    req.end();
  });
}

function waitForChildPort(child, getOutput, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => finish(new Error(`Isolated server did not start: ${output}`)), timeoutMs);
    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(/READY:(\d+)/);
      if (match) finish(null, Number(match[1]));
    };
    const onExit = (code, signal) => finish(new Error(`Isolated server exited before ready (${code ?? signal}): ${getOutput()}`));
    const finish = (error, port) => {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.off("exit", onExit);
      if (error) reject(error);
      else resolve(port);
    };
    child.stdout.on("data", onData);
    child.once("exit", onExit);
  });
}

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  child.kill("SIGTERM");
  return Promise.race([
    once(child, "exit").then(() => undefined),
    delay(1000).then(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }),
  ]);
}

test("survives gzip frame followed by trailing bytes in an isolated process", { timeout: 15000 }, async (t) => {
  const appUrl = new URL("../src/app.js", import.meta.url).href;
  const childSource = `
    import { createServer } from "node:http";
    import app from ${JSON.stringify(appUrl)};
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => console.log("READY:" + server.address().port));
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", childSource], {
    cwd: process.cwd(),
    // The child intentionally receives no application secrets or database URL.
    env: { PATH: process.env.PATH, NODE_ENV: "test", CLIENT_ORIGIN: allowedOrigin },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let childOutput = "";
  child.stderr.setEncoding("utf8").on("data", (chunk) => { childOutput += chunk; });
  t.after(() => stopChild(child));

  const port = await waitForChildPort(child, () => childOutput);
  const trailingBody = Buffer.concat([
    gzipSync(Buffer.from('{"a":1}')),
    Buffer.from([0]),
    Buffer.alloc(100 * 1024, 0x58),
  ]);
  const vulnerableRequest = await new Promise((resolve, reject) => {
    const req = request({
      host: "127.0.0.1",
      port,
      path: "/api/health",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        "Content-Length": trailingBody.length,
      },
    }, (res) => {
      res.resume();
      res.once("end", () => resolve(res.statusCode));
    });
    req.setTimeout(4000, () => req.destroy(new Error("Compressed regression request timed out.")));
    req.once("error", reject);
    req.end(trailingBody);
  });

  // The affected zlib error can be emitted after the parser has already replied.
  await delay(250);
  assert.equal(vulnerableRequest, 404, "unmatched POST is parsed before Express returns its normal 404");
  assert.equal(child.exitCode, null, `isolated backend exited after compressed trailing bytes: ${childOutput}`);

  const health = await getResponse(`http://127.0.0.1:${port}`, "/api/health");
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body), {
    success: true,
    message: "Attelier.dev API is running",
  });
});

test("JSON parser keeps valid inquiry, malformed JSON, and 10 KB limit behavior", { timeout: 10000 }, async (t) => {
  const previousAppEnvironment = app.get("env");
  app.set("env", "production");
  t.after(() => app.set("env", previousAppEnvironment));

  const originalCreate = Inquiry.create;
  let createdInquiry;
  Inquiry.create = async (input) => {
    createdInquiry = input;
    return { _id: "mock-inquiry-id" };
  };
  t.after(() => { Inquiry.create = originalCreate; });

  const { baseUrl } = await startServer(t);
  const valid = await postJson(baseUrl, "/api/inquiries", {
    name: "Ada Lovelace",
    email: "ada@example.com",
    service: "Web Development",
    message: "I would like to discuss a project.",
  }, { Origin: allowedOrigin });
  assert.equal(valid.status, 201);
  assert.equal(JSON.parse(valid.body).inquiryId, "mock-inquiry-id");
  assert.equal(createdInquiry.email, "ada@example.com");
  assert.equal(valid.headers["access-control-allow-origin"], allowedOrigin);
  assert.ok(valid.headers["content-security-policy"]);
  assert.equal(valid.headers["x-powered-by"], undefined);

  const malformed = await postJson(baseUrl, "/api/inquiries", "{invalid json");
  assert.equal(malformed.status, 400);
  assert.doesNotMatch(malformed.body, /SyntaxError|body-parser\/lib/);

  const oversized = await postJson(baseUrl, "/api/inquiries", {
    name: "Ada Lovelace",
    email: "ada@example.com",
    service: "Web Development",
    message: "x".repeat(11 * 1024),
  });
  assert.equal(oversized.status, 413);
  assert.doesNotMatch(oversized.body, /PayloadTooLargeError|body-parser\/lib/);
});

test("admin login still accepts JSON while protected endpoints reject missing sessions", { timeout: 10000 }, async (t) => {
  const originals = [
    [Admin, "findOne", Admin.findOne],
    [Admin, "exists", Admin.exists],
    [AdminSession, "create", AdminSession.create],
  ];
  t.after(() => originals.forEach(([model, method, original]) => { model[method] = original; }));

  const password = "Str0ng!Passphrase#2026";
  const passwordHash = await hashPassword(password);
  Admin.findOne = () => ({ select: async () => ({
    _id: "mock-admin-id",
    email: "owner@example.com",
    passwordHash,
    isActive: true,
    role: "admin",
  }) });
  Admin.exists = async () => ({ _id: "mock-admin-id" });
  AdminSession.create = async (session) => session;

  const { baseUrl } = await startServer(t);
  const login = await postJson(baseUrl, "/api/admin/auth/login", {
    email: "owner@example.com",
    password,
  }, { Origin: allowedOrigin });
  assert.equal(login.status, 200);
  assert.equal(JSON.parse(login.body).admin.email, "owner@example.com");
  assert.match(login.headers["set-cookie"][0], /HttpOnly/i);

  const overview = await getResponse(baseUrl, "/api/admin/overview");
  assert.equal(overview.status, 401);
});
