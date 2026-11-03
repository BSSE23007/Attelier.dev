import test from "node:test";
import assert from "node:assert/strict";
import { buildInquiryUrl, resolveApiBaseUrl, submitInquiry } from "../src/contactApi.js";

const inquiry = {
  name: "Milestone QA",
  email: "qa@example.invalid",
  service: "Other",
  message: "A test inquiry used for automated API workflow checks.",
};

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("normalizes API base URLs with trailing slashes", () => {
  assert.equal(buildInquiryUrl("http://localhost:5000/"), "http://localhost:5000/api/inquiries");
  assert.equal(buildInquiryUrl("https://api.example.invalid///"), "https://api.example.invalid/api/inquiries");
});

test("uses localhost only in development when no API base is configured", () => {
  assert.equal(resolveApiBaseUrl("", true), "http://localhost:5000");
  assert.equal(resolveApiBaseUrl("", false), null);
  assert.equal(resolveApiBaseUrl("https://api.example.invalid/", false), "https://api.example.invalid");
});

test("submits to the normalized path and accepts confirmed success", async () => {
  let requestUrl;
  const result = await submitInquiry(inquiry, {
    baseUrl: "http://localhost:5000/",
    fetchImpl: async (url) => {
      requestUrl = url;
      return jsonResponse(201, { success: true, inquiryId: "test-id" });
    },
  });
  assert.equal(requestUrl, "http://localhost:5000/api/inquiries");
  assert.equal(result.inquiryId, "test-id");
});

test("does not treat an HTTP failure as success", async () => {
  await assert.rejects(
    submitInquiry(inquiry, { fetchImpl: async () => jsonResponse(500, { success: false }) }),
    /couldn’t submit your inquiry/
  );
});

test("uses safe messages for validation and rate-limit responses", async () => {
  await assert.rejects(
    submitInquiry(inquiry, { fetchImpl: async () => jsonResponse(400, { success: false }) }),
    /check your inquiry details/
  );
  await assert.rejects(
    submitInquiry(inquiry, { fetchImpl: async () => ({ ...jsonResponse(429, {}), json: async () => { throw new Error("non-JSON response"); } }) }),
    /Too many requests/
  );
});

test("reports network failures without exposing low-level details", async () => {
  await assert.rejects(
    submitInquiry(inquiry, { fetchImpl: async () => { throw new TypeError("connection refused internal detail"); } }),
    (error) => error.message === "We couldn’t reach the inquiry server. Please try again." && !error.message.includes("internal detail")
  );
});

test("aborts requests that exceed the configured timeout", async () => {
  await assert.rejects(
    submitInquiry(inquiry, {
      timeoutMs: 5,
      fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
    }),
    /request took too long/
  );
});

test("validates required form fields and accepted service options", async () => {
  const { inquiryFormSchema } = await import("../src/contactValidation.js");
  const invalid = inquiryFormSchema.safeParse({});
  assert.equal(invalid.success, false);
  assert.deepEqual(new Set(invalid.error.issues.map((issue) => issue.path[0])), new Set(["name", "email", "service", "message"]));
  assert.equal(inquiryFormSchema.safeParse({ ...inquiry, service: "Made up service" }).success, false);
});

test("normalizes valid form values before submission", async () => {
  const { inquiryFormSchema } = await import("../src/contactValidation.js");
  const result = inquiryFormSchema.parse({
    ...inquiry,
    name: "  Milestone QA  ",
    email: "  QA@EXAMPLE.INVALID  ",
    message: "  A test inquiry used for automated API workflow checks.  ",
  });
  assert.equal(result.name, "Milestone QA");
  assert.equal(result.email, "qa@example.invalid");
  assert.equal(result.message, "A test inquiry used for automated API workflow checks.");
});
