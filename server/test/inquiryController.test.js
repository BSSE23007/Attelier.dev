import test from "node:test";
import assert from "node:assert/strict";
import Inquiry from "../src/models/Inquiry.js";
import { createInquiry, inquirySchema } from "../src/controllers/inquiryController.js";

const validInquiry = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  service: "Web Development",
  message: "I would like to discuss a new website project.",
};

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function submit(body) {
  const res = responseRecorder();
  await createInquiry({ body }, res);
  return res;
}

test("creates a valid inquiry and returns its id", async (t) => {
  const originalCreate = Inquiry.create;
  let received;
  Inquiry.create = async (data) => {
    received = data;
    return { _id: "inquiry-123" };
  };
  t.after(() => { Inquiry.create = originalCreate; });

  const res = await submit({ ...validInquiry, notes: [{ body: "Public visitors must not set notes." }] });

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, {
    success: true,
    message: "Your project inquiry has been received!",
    inquiryId: "inquiry-123",
  });
  assert.equal("notes" in res.body, false);
  assert.equal("activity" in res.body, false);
  assert.deepEqual(received, validInquiry);
});

test("rejects invalid or missing names", async () => {
  for (const name of [undefined, "A"]) {
    const res = await submit({ ...validInquiry, name });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.errors.some((error) => error.field === "name"));
  }
});

test("rejects invalid email addresses", async () => {
  const res = await submit({ ...validInquiry, email: "not-an-email" });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.errors.some((error) => error.field === "email"));
});

test("rejects unsupported service values", async () => {
  const res = await submit({ ...validInquiry, service: "Something else" });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.errors.some((error) => error.field === "service"));
});

test("rejects requests with missing required fields", async () => {
  const res = await submit({});
  assert.equal(res.statusCode, 400);
  assert.deepEqual(
    new Set(res.body.errors.map((error) => error.field)),
    new Set(["name", "email", "service", "message"])
  );
});

test("rejects messages shorter than 10 characters", async () => {
  const res = await submit({ ...validInquiry, message: "Too short" });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.errors.some((error) => error.field === "message"));
});

test("rejects messages longer than 3000 characters", async () => {
  const res = await submit({ ...validInquiry, message: "x".repeat(3001) });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.errors.some((error) => error.field === "message"));
});

test("trims inquiry fields before database creation", async (t) => {
  const originalCreate = Inquiry.create;
  let received;
  Inquiry.create = async (data) => {
    received = data;
    return { _id: "trimmed-inquiry" };
  };
  t.after(() => { Inquiry.create = originalCreate; });

  const res = await submit({
    name: "  Ada Lovelace  ",
    email: "  ADA@EXAMPLE.COM  ",
    service: "  Web Development  ",
    message: "  I would like to discuss a new website project.  ",
  });

  assert.equal(res.statusCode, 201);
  assert.deepEqual(received, {
    name: "Ada Lovelace",
    email: "ada@example.com",
    service: "Web Development",
    message: "I would like to discuss a new website project.",
  });
});

test("returns HTTP 500 when database creation fails", async (t) => {
  const originalCreate = Inquiry.create;
  Inquiry.create = async () => { throw new Error("database unavailable"); };
  t.after(() => { Inquiry.create = originalCreate; });

  const res = await submit(validInquiry);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    message: "Unable to submit your inquiry right now.",
  });
});

test("schema trims validated values", () => {
  const result = inquirySchema.parse({
    name: "  Ada Lovelace  ",
    email: "  ada@example.com  ",
    service: "  Web Development  ",
    message: "  I would like to discuss a new website project.  ",
  });
  assert.equal(result.name, "Ada Lovelace");
  assert.equal(result.email, "ada@example.com");
  assert.equal(result.service, "Web Development");
  assert.equal(result.message, "I would like to discuss a new website project.");
});
