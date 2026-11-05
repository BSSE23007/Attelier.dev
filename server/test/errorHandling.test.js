import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import mongoose from "mongoose";
import Inquiry from "../src/models/Inquiry.js";
import { createInquiry } from "../src/controllers/inquiryController.js";
import connectDB from "../src/config/db.js";
import { apiErrorHandler, notFoundHandler } from "../src/middleware/errorHandling.js";

async function startServer(t, application) {
  const server = createServer(application);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function createErrorTestApp() {
  const app = express();
  app.use(express.json({ limit: "10kb" }));
  app.get("/throw", async () => {
    throw new Error("MongoServerError: mongodb+srv://dbuser:db-password@cluster.example/private_db at /srv/attelier/server/internal.js");
  });
  app.use(notFoundHandler);
  app.use(apiErrorHandler);
  return app;
}

function setNodeEnv(t, value) {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  t.after(() => {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  });
}

test("production unexpected errors return one generic JSON shape without stack, paths, or database details", async (t) => {
  setNodeEnv(t, "production");
  const baseUrl = await startServer(t, createErrorTestApp());
  const response = await fetch(`${baseUrl}/throw`);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, { success: false, message: "Internal server error." });
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /stack|MongoServerError|mongodb\+srv|db-password|private_db|\/srv\/attelier/);
});

test("development error responses retain useful exception details", async (t) => {
  setNodeEnv(t, "development");
  const baseUrl = await startServer(t, createErrorTestApp());
  const response = await fetch(`${baseUrl}/throw`);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.match(body.message, /MongoServerError/);
  assert.match(body.stack, /internal\.js/);
});

test("invalid request JSON keeps a safe 400 response", async (t) => {
  setNodeEnv(t, "production");
  const baseUrl = await startServer(t, createErrorTestApp());
  const response = await fetch(`${baseUrl}/throw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{invalid json",
  });
  // GET is not used for the POST case; the parser still fails before routing.
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.deepEqual(body, { success: false, message: "Invalid JSON request body." });
});

test("oversized JSON keeps a safe 413 response", async (t) => {
  setNodeEnv(t, "production");
  const baseUrl = await startServer(t, createErrorTestApp());
  const response = await fetch(`${baseUrl}/throw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(11 * 1024) }),
  });
  const body = await response.json();
  assert.equal(response.status, 413);
  assert.deepEqual(body, { success: false, message: "Request body is too large." });
});

test("unknown routes return a consistent safe JSON 404", async (t) => {
  setNodeEnv(t, "production");
  const baseUrl = await startServer(t, createErrorTestApp());
  const response = await fetch(`${baseUrl}/unknown/path`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { success: false, message: "Route not found." });
});

test("inquiry validation responses remain unchanged", async (t) => {
  setNodeEnv(t, "production");
  const app = express();
  app.use(express.json({ limit: "10kb" }));
  app.post("/api/inquiries", createInquiry);
  app.use(notFoundHandler);
  app.use(apiErrorHandler);
  const baseUrl = await startServer(t, app);
  const response = await fetch(`${baseUrl}/api/inquiries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "A", email: "bad", service: "unknown", message: "short" }),
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.message, "Please check your inquiry details.");
  assert.ok(Array.isArray(body.errors));
});

test("sanitized operational logs omit raw database errors and sensitive request data", async (t) => {
  setNodeEnv(t, "production");
  const originalCreate = Inquiry.create;
  const originalConsoleError = console.error;
  const captured = [];
  t.after(() => {
    Inquiry.create = originalCreate;
    console.error = originalConsoleError;
  });
  Inquiry.create = async () => {
    const error = new Error("mongodb+srv://dbuser:db-password@cluster.example/private_db?token=uri-secret at /srv/attelier/internal.js");
    error.name = "MongoServerError";
    error.code = 18;
    throw error;
  };
  console.error = (...args) => captured.push(args);

  const app = express();
  app.use(express.json({ limit: "10kb" }));
  app.post("/api/inquiries", createInquiry);
  app.use(notFoundHandler);
  app.use(apiErrorHandler);
  const baseUrl = await startServer(t, app);
  const response = await fetch(`${baseUrl}/api/inquiries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: "session-cookie-secret",
      Authorization: "Bearer auth-header-secret",
    },
    body: JSON.stringify({
      name: "Ada Lovelace",
      email: "ada@example.com",
      service: "Web Development",
      message: "Please build a secure site for my organization.",
      password: "request-password-secret",
      token: "request-token-secret",
    }),
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { success: false, message: "Unable to submit your inquiry right now." });

  const logs = JSON.stringify(captured);
  assert.match(logs, /Inquiry creation failed/);
  assert.match(logs, /MongoServerError/);
  assert.match(logs, /18/);
  assert.doesNotMatch(logs, /db-password|uri-secret|private_db|internal\.js|session-cookie-secret|auth-header-secret|request-password-secret|request-token-secret/);
});

test("database startup failure logs safe diagnostics without logging the connection string", async (t) => {
  const originalConnect = mongoose.connect;
  const originalExit = process.exit;
  const originalConsoleError = console.error;
  const captured = [];
  let exitCode;
  t.after(() => {
    mongoose.connect = originalConnect;
    process.exit = originalExit;
    console.error = originalConsoleError;
  });
  mongoose.connect = async () => {
    const error = new Error("mongodb+srv://dbuser:db-password@cluster.example/private_db?auth=uri-secret");
    error.name = "MongoServerSelectionError";
    error.code = "ECONNREFUSED";
    throw error;
  };
  process.exit = (code) => { exitCode = code; };
  console.error = (...args) => captured.push(args);

  await connectDB();
  assert.equal(exitCode, 1);
  const logs = JSON.stringify(captured);
  assert.match(logs, /MongoDB connection failed/);
  assert.match(logs, /MongoServerSelectionError/);
  assert.match(logs, /ECONNREFUSED/);
  assert.doesNotMatch(logs, /db-password|cluster\.example|private_db|uri-secret/);
});

test("unhandled API errors are logged with sanitized class and code only", async (t) => {
  setNodeEnv(t, "production");
  const originalConsoleError = console.error;
  const captured = [];
  t.after(() => { console.error = originalConsoleError; });
  console.error = (...args) => captured.push(args);

  const baseUrl = await startServer(t, createErrorTestApp());
  const response = await fetch(`${baseUrl}/throw`, {
    headers: { Cookie: "cookie-secret", Authorization: "Bearer header-secret" },
  });
  assert.equal(response.status, 500);
  const logs = JSON.stringify(captured);
  assert.match(logs, /Unhandled API error/);
  assert.match(logs, /Error/);
  assert.doesNotMatch(logs, /db-password|cluster\.example|private_db|\/srv\/attelier|cookie-secret|header-secret/);
});
