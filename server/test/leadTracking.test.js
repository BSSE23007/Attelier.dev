import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import Inquiry from "../src/models/Inquiry.js";
import AdminSession from "../src/models/AdminSession.js";
import app from "../src/app.js";
import { createInquiry } from "../src/controllers/inquiryController.js";
import {
  getAdminInquiry,
  listAdminInquiries,
  markAdminInquiryResponded,
  updateAdminInquiryPriority,
  updateAdminInquiryStatus,
} from "../src/controllers/adminInquiryController.js";
import { getAdminOverview } from "../src/controllers/adminOverviewController.js";

const inquiryId = "64b000000000000000000001";
const adminId = "64b000000000000000000002";
const baseInquiry = {
  _id: inquiryId,
  name: "Ada Lovelace",
  email: "ada@example.com",
  service: "Web Development",
  message: "Please discuss a software project with me.",
  status: "new",
  createdAt: new Date("2026-05-05T12:00:00.000Z"),
  updatedAt: new Date("2026-05-05T12:00:00.000Z"),
};

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function restore(t, Model, methods) {
  const originals = methods.map((name) => [name, Model[name]]);
  t.after(() => originals.forEach(([name, original]) => { Model[name] = original; }));
}

async function listen(t) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function mockFindById(value) {
  return {
    select() { return this; },
    lean: async () => value,
  };
}

test("new inquiries default to normal priority and legacy records serialize as normal", async (t) => {
  const created = new Inquiry({
    name: "Ada Lovelace", email: "ada@example.com", service: "Other", message: "A sufficiently long inquiry message.",
  });
  assert.equal(created.priority, "normal");
  assert.equal(Inquiry.schema.path("firstRespondedAt").instance, "Date");
  assert.ok(Inquiry.schema.path("firstRespondedAt").options.default === undefined);
  assert.ok(Inquiry.schema.path("priority").enumValues.includes("high"));
  assert.ok(Inquiry.schema.path("activity").schema.path("type").enumValues.includes("first-response-recorded"));

  restore(t, Inquiry, ["find", "countDocuments"]);
  Inquiry.countDocuments = async () => 1;
  Inquiry.find = () => ({
    sort() { return this; }, skip() { return this; }, limit() { return this; }, select() { return this; },
    lean: async () => [baseInquiry],
  });
  const res = responseRecorder();
  await listAdminInquiries({ query: {} }, res);
  assert.equal(res.body.data[0].priority, "normal");
  assert.equal(res.body.data[0].firstRespondedAt, null);
});

test("admin can change priority and the atomic update records activity", async (t) => {
  restore(t, Inquiry, ["findOneAndUpdate"]);
  let captured;
  Inquiry.findOneAndUpdate = async (filter, update, options) => {
    captured = { filter, update, options };
    return { ...baseInquiry, priority: update.$set.priority, updatedAt: new Date() };
  };
  const res = responseRecorder();
  await updateAdminInquiryPriority({ params: { id: inquiryId }, body: { priority: "high" }, admin: { id: adminId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.priority, "high");
  assert.deepEqual(captured.filter, { _id: inquiryId, priority: { $ne: "high" } });
  assert.equal(captured.update.$push.activity.type, "priority-changed");
  assert.equal(captured.update.$push.activity.priority, "high");
  assert.equal(captured.update.$push.activity.createdBy, adminId);
  assert.equal(captured.options.runValidators, true);
  assert.deepEqual(Object.keys(captured.update.$set), ["priority"]);
});

test("invalid priority and unexpected priority fields are rejected before database writes", async (t) => {
  restore(t, Inquiry, ["findOneAndUpdate"]);
  Inquiry.findOneAndUpdate = () => assert.fail("invalid priority must not write");
  for (const body of [{ priority: "urgent" }, { priority: "low", status: "completed" }, {}]) {
    const res = responseRecorder();
    await updateAdminInquiryPriority({ params: { id: inquiryId }, body, admin: { id: adminId } }, res);
    assert.equal(res.statusCode, 400);
  }
});

test("legacy normal priority is returned without unnecessary activity when already normal", async (t) => {
  restore(t, Inquiry, ["findOneAndUpdate", "findById"]);
  Inquiry.findOneAndUpdate = async () => null;
  Inquiry.findById = () => mockFindById({ ...baseInquiry, priority: undefined });
  const res = responseRecorder();
  await updateAdminInquiryPriority({ params: { id: inquiryId }, body: { priority: "normal" }, admin: { id: adminId } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.priority, "normal");
});

test("Mark as Responded stores a server timestamp atomically and keeps it on repeats", async (t) => {
  restore(t, Inquiry, ["findOneAndUpdate", "findById"]);
  const originalTimestamp = new Date("2026-05-05T12:30:00.000Z");
  let storedAt = null;
  let updateCount = 0;
  let captured;
  const startedAt = Date.now();
  Inquiry.findOneAndUpdate = async (filter, update, options) => {
    captured = { filter, update, options };
    if (storedAt) return null;
    updateCount += 1;
    storedAt = update.$set.firstRespondedAt;
    assert.ok(storedAt instanceof Date);
    assert.ok(storedAt.getTime() >= startedAt && storedAt.getTime() <= Date.now());
    return { ...baseInquiry, firstRespondedAt: storedAt, updatedAt: storedAt };
  };
  Inquiry.findById = () => mockFindById({ ...baseInquiry, firstRespondedAt: storedAt || originalTimestamp });

  const first = responseRecorder();
  await markAdminInquiryResponded({ params: { id: inquiryId }, body: {}, admin: { id: adminId } }, first);
  const firstStoredAt = first.body.data.firstRespondedAt;
  const second = responseRecorder();
  await markAdminInquiryResponded({ params: { id: inquiryId }, body: {}, admin: { id: adminId } }, second);

  assert.equal(first.statusCode, 200);
  assert.equal(firstStoredAt, storedAt);
  assert.equal(second.body.data.firstRespondedAt, firstStoredAt);
  assert.equal(updateCount, 1);
  assert.deepEqual(captured.filter, { _id: inquiryId, firstRespondedAt: null });
  assert.equal(captured.update.$push.activity.type, "first-response-recorded");
  assert.equal(captured.update.$push.activity.createdBy, adminId);
  assert.equal(captured.options.runValidators, true);
});

test("first-response endpoint rejects client-supplied timestamps", async (t) => {
  restore(t, Inquiry, ["findOneAndUpdate"]);
  Inquiry.findOneAndUpdate = () => assert.fail("invalid body must not update");
  const res = responseRecorder();
  await markAdminInquiryResponded({
    params: { id: inquiryId }, body: { firstRespondedAt: "2001-01-01T00:00:00.000Z" }, admin: { id: adminId },
  }, res);
  assert.equal(res.statusCode, 400);
});

test("invalid inquiry IDs are rejected by both new admin actions", async () => {
  const priority = responseRecorder();
  await updateAdminInquiryPriority({ params: { id: "invalid" }, body: { priority: "high" }, admin: { id: adminId } }, priority);
  assert.equal(priority.statusCode, 400);
  const response = responseRecorder();
  await markAdminInquiryResponded({ params: { id: "invalid" }, body: {}, admin: { id: adminId } }, response);
  assert.equal(response.statusCode, 400);
});

test("status changes never set a first-response timestamp, including completion", async (t) => {
  restore(t, Inquiry, ["findByIdAndUpdate"]);
  let captured;
  Inquiry.findByIdAndUpdate = async (_id, update) => {
    captured = update;
    return { ...baseInquiry, status: update.$set.status, firstRespondedAt: undefined };
  };
  const res = responseRecorder();
  await updateAdminInquiryStatus({ params: { id: inquiryId }, body: { status: "completed" }, admin: { id: adminId } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal("firstRespondedAt" in captured.$set, false);
  assert.equal(res.body.data.status, "completed");
});

test("priority and response filters combine with search, follow-up, and bounded pagination", async (t) => {
  restore(t, Inquiry, ["find", "countDocuments"]);
  let capturedFilter;
  let capturedQuery;
  Inquiry.countDocuments = async (filter) => { capturedFilter = filter; return 42; };
  Inquiry.find = (filter) => {
    capturedFilter = filter;
    capturedQuery = { skipped: null, size: null };
    return {
      sort() { return this; },
      skip(value) { capturedQuery.skipped = value; return this; },
      limit(value) { capturedQuery.size = value; return this; },
      select() { return this; },
      lean: async () => [{ ...baseInquiry, priority: "high", firstRespondedAt: null }],
    };
  };
  const res = responseRecorder();
  await listAdminInquiries({ query: {
    page: "3", pageSize: "10", search: "Ada", status: "completed", service: "Web Development",
    priority: "high", response: "awaiting", followUp: "none",
  } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(capturedFilter.priority, "high");
  assert.equal(capturedFilter.status, "completed");
  assert.equal(capturedFilter.service, "Web Development");
  assert.equal(capturedQuery.skipped, 20);
  assert.equal(capturedQuery.size, 10);
  assert.equal(res.body.pagination.total, 42);
  assert.ok(capturedFilter.$and.some((clause) => clause.firstRespondedAt === null));
  assert.ok(capturedFilter.$and.some((clause) => clause.followUpAt === null));
  assert.ok(capturedFilter.$and.some((clause) => clause.$or?.[0].name));
  assert.equal(res.body.data[0].priority, "high");
  assert.equal(res.body.data[0].firstRespondedAt, null);
});

test("normal priority filter includes legacy records without priority", async (t) => {
  restore(t, Inquiry, ["find", "countDocuments"]);
  let captured;
  Inquiry.countDocuments = async () => 0;
  Inquiry.find = (filter) => {
    captured = filter;
    return { sort() { return this; }, skip() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => [] };
  };
  const res = responseRecorder();
  await listAdminInquiries({ query: { priority: "normal" } }, res);
  assert.deepEqual(captured.$and, [{ $or: [{ priority: "normal" }, { priority: null }] }]);
});

test("completed inquiries without first response remain in awaiting filters", async (t) => {
  restore(t, Inquiry, ["find", "countDocuments"]);
  let captured;
  Inquiry.countDocuments = async () => 1;
  Inquiry.find = (filter) => {
    captured = filter;
    return { sort() { return this; }, skip() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => [{ ...baseInquiry, status: "completed" }] };
  };
  const res = responseRecorder();
  await listAdminInquiries({ query: { response: "awaiting", status: "completed" } }, res);
  assert.equal(res.body.data.length, 1);
  assert.equal(captured.status, "completed");
  assert.ok(captured.$and.some((clause) => clause.firstRespondedAt === null));
});

test("dashboard reports high-priority, awaiting, and recorded response counts", async (t) => {
  restore(t, Inquiry, ["countDocuments", "find", "aggregate"]);
  const filters = [];
  Inquiry.countDocuments = async (filter) => {
    filters.push(filter);
    return filters.length;
  };
  Inquiry.find = () => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => [] });
  Inquiry.aggregate = async () => [];
  const res = responseRecorder();
  await getAdminOverview({ query: { today: "2026-05-05" } }, res);
  assert.deepEqual(res.body.data.leadTracking, { highPriority: 8, awaitingFirstResponse: 9, firstResponseRecorded: 10 });
  assert.deepEqual(filters[7], { priority: "high" });
  assert.deepEqual(filters[8], { firstRespondedAt: null });
  assert.deepEqual(filters[9], { firstRespondedAt: { $ne: null } });
});

test("public inquiry submission cannot set priority or first-response tracking", async (t) => {
  restore(t, Inquiry, ["create"]);
  let created;
  Inquiry.create = async (data) => { created = data; return { _id: inquiryId }; };
  const res = responseRecorder();
  await createInquiry({ body: {
    name: "Ada Lovelace", email: "ada@example.com", service: "Other",
    message: "Please discuss my project request.", priority: "high", firstRespondedAt: "2001-01-01",
  } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal("priority" in created, false);
  assert.equal("firstRespondedAt" in created, false);
});

test("priority and first-response routes require the existing administrator session", async (t) => {
  const baseUrl = await listen(t);
  for (const [path, method, body] of [
    [`/api/admin/inquiries/${inquiryId}/priority`, "PATCH", { priority: "high" }],
    [`/api/admin/inquiries/${inquiryId}/first-response`, "POST", {}],
  ]) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 401);
  }
});

test("authenticated lead mutations retain the trusted-origin check", async (t) => {
  restore(t, Inquiry, ["findOneAndUpdate", "findById"]);
  const originalFind = AdminSession.findOne;
  t.after(() => { AdminSession.findOne = originalFind; });
  const admin = { _id: adminId, email: "admin@example.invalid", role: "admin", isActive: true, credentialVersion: 0 };
  AdminSession.findOne = () => ({ populate: async () => ({
    _id: "isolated-session", credentialVersion: 0,
    expiresAt: new Date(Date.now() + 60_000), adminId: admin,
  }) });
  let writes = 0;
  Inquiry.findOneAndUpdate = async (_filter, update) => {
    writes += 1;
    if (update.$set.priority) return { ...baseInquiry, priority: update.$set.priority };
    return { ...baseInquiry, firstRespondedAt: update.$set.firstRespondedAt };
  };
  Inquiry.findById = () => mockFindById({ ...baseInquiry, firstRespondedAt: new Date() });
  const baseUrl = await listen(t);
  const send = (path, method, body, origin) => fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json", Origin: origin,
      Cookie: "attelier_admin_session=isolated-session-token",
    },
    body: JSON.stringify(body),
  });
  const priorityPath = `/api/admin/inquiries/${inquiryId}/priority`;
  const responsePath = `/api/admin/inquiries/${inquiryId}/first-response`;
  assert.equal((await send(priorityPath, "PATCH", { priority: "high" }, "https://untrusted.example")).status, 403);
  assert.equal((await send(responsePath, "POST", {}, "https://untrusted.example")).status, 403);
  assert.equal(writes, 0);
  assert.equal((await send(priorityPath, "PATCH", { priority: "high" }, "http://localhost:5173")).status, 200);
  assert.equal((await send(responsePath, "POST", {}, "http://localhost:5173")).status, 200);
  assert.equal(writes, 2);
});

test("admin detail includes first-response and priority values while public inquiry APIs remain private", async (t) => {
  restore(t, Inquiry, ["findById", "find"]);
  const firstRespondedAt = new Date("2026-05-06T10:00:00.000Z");
  Inquiry.findById = () => ({
    populate() { return this; },
    lean: async () => ({
      ...baseInquiry, priority: "high", firstRespondedAt,
      notes: [{ _id: "private-note", body: "Private", createdBy: { email: "admin@example.invalid" }, createdAt: firstRespondedAt }],
      activity: [{ _id: "private-activity", type: "first-response-recorded", createdBy: { email: "admin@example.invalid" }, createdAt: firstRespondedAt }],
    }),
  });
  Inquiry.find = () => ({ select() { return this; }, sort() { return this; }, lean: async () => [] });
  const res = responseRecorder();
  await getAdminInquiry({ params: { id: inquiryId } }, res);
  assert.equal(res.body.data.priority, "high");
  assert.equal(res.body.data.firstRespondedAt, firstRespondedAt);
  assert.equal(res.body.data.notes[0].body, "Private");
  assert.equal(res.body.data.activity[0].type, "first-response-recorded");
  assert.deepEqual(res.body.data.possibleDuplicates, []);
});
