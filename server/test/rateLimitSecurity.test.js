import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import { ipKeyGenerator } from "express-rate-limit";
import app from "../src/app.js";
import { createApiLimiter } from "../src/middleware/rateLimiters.js";

async function listen(t, application) {
  const server = createServer(application);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function createPublicInquiryTestApp({ limit = 2, windowMs = 60_000 } = {}) {
  const testApp = express();
  testApp.set("trust proxy", false);
  // This isolated test hook represents distinct TCP peers. Production never
  // accepts this header as an address source.
  testApp.use((req, _res, next) => {
    const testClientAddress = req.get("x-test-client-address");
    if (testClientAddress) Object.defineProperty(req, "ip", { configurable: true, value: testClientAddress });
    next();
  });
  testApp.use("/api", createApiLimiter({ limit, windowMs, validate: { xForwardedForHeader: false } }));
  testApp.post("/api/inquiries", (_req, res) => res.status(201).json({ success: true }));
  return testApp;
}

test("production app keeps proxy trust disabled", () => {
  assert.equal(app.get("trust proxy"), false);
});

test("direct client IP ignores valid and invalid untrusted forwarded headers", async (t) => {
  const probe = express();
  probe.set("trust proxy", false);
  probe.get("/ip", (req, res) => res.json({ ip: req.ip, remoteAddress: req.socket.remoteAddress, ips: req.ips }));
  const baseUrl = await listen(t, probe);

  const validSpoof = await fetch(`${baseUrl}/ip`, { headers: { "X-Forwarded-For": "198.51.100.77" } });
  const validResult = await validSpoof.json();
  assert.equal(validResult.ip, validResult.remoteAddress);
  assert.deepEqual(validResult.ips, []);

  const invalidForwarded = await fetch(`${baseUrl}/ip`, { headers: { "X-Forwarded-For": "not-an-ip, 198.51.100.77" } });
  const invalidResult = await invalidForwarded.json();
  assert.equal(invalidResult.ip, invalidResult.remoteAddress);
  assert.equal(invalidResult.ip, validResult.ip);
  assert.deepEqual(invalidResult.ips, []);
});

test("API inquiry limiter shares a client's counter, isolates other IPs, and returns standard headers", async (t) => {
  const baseUrl = await listen(t, createPublicInquiryTestApp({ limit: 2 }));
  const postInquiry = (clientIp, forwardedFor) => fetch(`${baseUrl}/api/inquiries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Client-Address": clientIp,
      "X-Forwarded-For": forwardedFor,
    },
    body: "{}",
  });

  const first = await postInquiry("198.51.100.20", "192.0.2.1");
  const second = await postInquiry("198.51.100.20", "192.0.2.2");
  const third = await postInquiry("198.51.100.20", "192.0.2.3");
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(third.status, 429);
  assert.match(first.headers.get("ratelimit"), /"2-in-1min"; r=1/);
  assert.ok(first.headers.get("ratelimit-policy"));
  assert.equal(first.headers.get("x-ratelimit-limit"), null);
  assert.equal((await postInquiry("198.51.100.21", "192.0.2.1")).status, 201);
});

test("default key generation normalizes IPv6 clients by subnet and preserves IPv4 identities", async (t) => {
  assert.equal(
    ipKeyGenerator("2001:db8:abcd:1201::1"),
    ipKeyGenerator("2001:db8:abcd:12fe::8"),
  );
  assert.notEqual(
    ipKeyGenerator("2001:db8:abcd:1201::1"),
    ipKeyGenerator("2001:db8:abcd:1301::1"),
  );
  assert.equal(ipKeyGenerator("198.51.100.30"), "198.51.100.30");

  const baseUrl = await listen(t, createPublicInquiryTestApp({ limit: 1 }));
  const post = (clientIp) => fetch(`${baseUrl}/api/inquiries`, {
    method: "POST",
    headers: { "X-Test-Client-Address": clientIp },
  });
  assert.equal((await post("2001:db8:abcd:1201::1")).status, 201);
  assert.equal((await post("2001:db8:abcd:12fe::8")).status, 429);
  assert.equal((await post("2001:db8:abcd:1301::1")).status, 201);
});

test("independent limiter instances do not share the default in-memory counters", async (t) => {
  const firstUrl = await listen(t, createPublicInquiryTestApp({ limit: 1 }));
  const secondUrl = await listen(t, createPublicInquiryTestApp({ limit: 1 }));
  const post = (url) => fetch(`${url}/api/inquiries`, {
    method: "POST",
    headers: { "X-Test-Client-Address": "198.51.100.40" },
  });
  assert.equal((await post(firstUrl)).status, 201);
  assert.equal((await post(firstUrl)).status, 429);
  assert.equal((await post(secondUrl)).status, 201);
});
