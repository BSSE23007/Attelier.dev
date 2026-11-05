import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import Inquiry from "../src/models/Inquiry.js";
import app from "../src/app.js";
import { createInquiryHandler } from "../src/controllers/inquiryController.js";
import { getAdminInquiry } from "../src/controllers/adminInquiryController.js";
import {
  buildDuplicateInquiryFilter,
  findPossibleDuplicateInquiries,
  normalizeInquiryEmail,
  normalizeInquiryMessage,
} from "../src/utils/duplicateInquiryMatching.js";

const currentDate = new Date("2026-06-10T12:00:00.000Z");
const current = {
  _id: "64b000000000000000000001", email: "ada@example.com", service: "Web Development",
  message: "Please build my website", status: "new", createdAt: currentDate,
};
const candidate = (overrides = {}) => ({
  _id: "prior-id", email: "ada@example.com", service: "Web Development",
  message: "Please build my website", status: "in-progress",
  createdAt: new Date(currentDate.getTime() - 60 * 60 * 1000), ...overrides,
});

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function restoreInquiry(t, methods) {
  const originals = methods.map((name) => [name, Inquiry[name]]);
  t.after(() => originals.forEach(([name, original]) => { Inquiry[name] = original; }));
}

test("exact same inquiry within 24 hours is a possible duplicate", () => {
  assert.deepEqual(findPossibleDuplicateInquiries(current, [candidate()]), [
    { id: "prior-id", createdAt: candidate().createdAt, status: "in-progress" },
  ]);
});

test("same email with a different message is not a duplicate", () => {
  assert.deepEqual(findPossibleDuplicateInquiries(current, [candidate({ message: "A different request" })]), []);
});

test("same email and message with a different service is not a duplicate", () => {
  assert.deepEqual(findPossibleDuplicateInquiries(current, [candidate({ service: "Cloud Engineering" })]), []);
});

test("same inquiry outside the preceding 24-hour window is not a duplicate", () => {
  assert.deepEqual(findPossibleDuplicateInquiries(current, [candidate({
    createdAt: new Date(currentDate.getTime() - 24 * 60 * 60 * 1000 - 1),
  })]), []);
});

test("email matching trims and ignores case", () => {
  assert.equal(normalizeInquiryEmail(" ADA@Example.COM "), "ada@example.com");
  assert.deepEqual(findPossibleDuplicateInquiries(current, [candidate({ email: " ADA@EXAMPLE.COM " })]).length, 1);
});

test("message matching ignores case and repeated whitespace", () => {
  assert.equal(normalizeInquiryMessage("  PLEASE  build\nmy WEBSITE "), "please build my website");
  assert.equal(findPossibleDuplicateInquiries(current, [candidate({ message: " PLEASE  BUILD\nMY WEBSITE " })]).length, 1);
});

test("the current inquiry is excluded and multiple prior matches are returned", () => {
  const matches = findPossibleDuplicateInquiries(current, [
    candidate({ _id: current._id }),
    candidate({ _id: "older-id", createdAt: new Date(currentDate.getTime() - 3 * 60 * 60 * 1000) }),
    candidate(),
  ]);
  assert.deepEqual(matches.map(({ id }) => id), ["prior-id", "older-id"]);
  assert.deepEqual(Object.keys(matches[0]).sort(), ["createdAt", "id", "status"]);
});

test("empty results and legacy inquiries without required fields produce no match", () => {
  assert.deepEqual(findPossibleDuplicateInquiries(current, []), []);
  assert.equal(buildDuplicateInquiryFilter({ _id: "legacy-id", createdAt: currentDate }), null);
  assert.equal(buildDuplicateInquiryFilter({ ...current, message: undefined }), null);
  assert.deepEqual(findPossibleDuplicateInquiries({ _id: "legacy-id", createdAt: currentDate }, [candidate()]), []);
});

test("admin detail performs a bounded, minimal candidate lookup and returns only match metadata", async (t) => {
  restoreInquiry(t, ["find", "findById"]);
  const candidates = [candidate({ message: " PLEASE  BUILD\nMY WEBSITE " })];
  let capturedFilter;
  let selectedFields;
  Inquiry.findById = () => ({
    populate() { return this; },
    lean: async () => ({ ...current, name: "Ada", notes: [], activity: [] }),
  });
  Inquiry.find = (filter) => {
    capturedFilter = filter;
    return {
      select(fields) { selectedFields = fields; return this; },
      sort() { return this; },
      lean: async () => candidates,
    };
  };

  const res = responseRecorder();
  await getAdminInquiry({ params: { id: current._id } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(capturedFilter._id.$ne, current._id);
  assert.equal(capturedFilter.service, current.service);
  assert.equal(capturedFilter.createdAt.$gte.toISOString(), "2026-06-09T12:00:00.000Z");
  assert.equal(capturedFilter.createdAt.$lt.toISOString(), currentDate.toISOString());
  assert.equal(selectedFields, "_id email service message createdAt status");
  assert.deepEqual(res.body.data.possibleDuplicates, [{
    id: "prior-id", createdAt: candidates[0].createdAt, status: "in-progress",
  }]);
  assert.equal("message" in res.body.data.possibleDuplicates[0], false);
  assert.equal("email" in res.body.data.possibleDuplicates[0], false);
  assert.equal(res.body.data.name, "Ada");
});

test("duplicate lookup failure does not break existing inquiry detail", async (t) => {
  restoreInquiry(t, ["find", "findById"]);
  Inquiry.findById = () => ({
    populate() { return this; },
    lean: async () => ({ ...current, name: "Ada", notes: [], activity: [] }),
  });
  Inquiry.find = () => ({ select() { throw new Error("isolated lookup failure"); } });
  const res = responseRecorder();
  await getAdminInquiry({ params: { id: current._id } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.possibleDuplicates, []);
  assert.equal(res.body.data.name, "Ada");
});

test("public inquiry response does not expose duplicate information", async () => {
  const handler = createInquiryHandler({
    persistInquiry: async () => ({ _id: "new-inquiry-id" }),
    notifyInquiry: async () => {},
  });
  const res = responseRecorder();
  await handler({ body: {
    name: "Ada Lovelace", email: "ada@example.com", service: "Other",
    message: "A long enough inquiry message.",
  } }, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(Object.keys(res.body).sort(), ["inquiryId", "message", "success"]);
  assert.equal("possibleDuplicates" in res.body, false);
});

test("unauthenticated callers cannot retrieve inquiry duplicate details", async (t) => {
  restoreInquiry(t, ["find", "findById"]);
  Inquiry.findById = () => assert.fail("unauthenticated requests must not query inquiries");
  Inquiry.find = () => assert.fail("unauthenticated requests must not query duplicate candidates");
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/inquiries/${current._id}`);
  assert.equal(response.status, 401);
});
