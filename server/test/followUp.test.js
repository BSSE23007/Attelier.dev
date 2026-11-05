import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import AdminSession from "../src/models/AdminSession.js";
import Inquiry from "../src/models/Inquiry.js";
import app from "../src/app.js";
import { getAdminOverview } from "../src/controllers/adminOverviewController.js";
import { listAdminInquiries, updateAdminInquiryFollowUp, updateAdminInquiryStatus } from "../src/controllers/adminInquiryController.js";
import { getCalendarDateRange, parseCalendarDate } from "../src/utils/calendarDate.js";

const inquiryId = "64b000000000000000000001";
const adminId = "64b000000000000000000002";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function restore(t, methods) {
  const originals = methods.map((method) => [method, Inquiry[method]]);
  t.after(() => originals.forEach(([method, original]) => { Inquiry[method] = original; }));
}

async function listen(t) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function mockFind(InquiryRef, rows, capture = () => {}) {
  InquiryRef.countDocuments = async () => 0;
  InquiryRef.find = (filter) => {
    capture(filter);
    return {
      sort(value) { this.sortValue = value; return this; },
      skip(value) { this.skipValue = value; return this; },
      limit(value) { this.limitValue = value; return this; },
      select() { return this; },
      lean: async () => rows,
      get query() { return { sort: this.sortValue, skip: this.skipValue, limit: this.limitValue }; },
    };
  };
};

test("calendar dates validate strictly and create UTC-midnight day boundaries", () => {
  assert.equal(parseCalendarDate("2026-02-30"), null);
  assert.equal(parseCalendarDate("2026-2-03"), null);
  assert.equal(parseCalendarDate({ date: "2026-05-05" }), null);
  assert.equal(parseCalendarDate("2024-02-29").toISOString(), "2024-02-29T00:00:00.000Z");
  const range = getCalendarDateRange("2026-05-05");
  assert.equal(range.start.toISOString(), "2026-05-05T00:00:00.000Z");
  assert.equal(range.next.toISOString(), "2026-05-06T00:00:00.000Z");
});

test("follow-up persistence is an optional date field with a query-supporting index", () => {
  const field = Inquiry.schema.path("followUpAt");
  assert.equal(field.instance, "Date");
  assert.notEqual(field.options.required, true);
  assert.ok(Inquiry.schema.indexes().some(([index]) => index.followUpAt === 1 && index.status === 1));
});

test("admin can create and update follow-up dates through the protected mutation controller", async (t) => {
  restore(t, ["findOneAndUpdate"]);
  const inquiry = { _id: inquiryId, status: "new", followUpAt: null, updatedAt: new Date() };
  let saved;
  Inquiry.findOneAndUpdate = async (filter, update, options) => {
    saved = { filter, update, options };
    inquiry.followUpAt = update.$set.followUpAt;
    return inquiry;
  };

  const first = responseRecorder();
  await updateAdminInquiryFollowUp({ params: { id: inquiryId }, body: { followUpAt: "2026-05-05" } }, first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.data.followUpAt.toISOString(), "2026-05-05T00:00:00.000Z");
  assert.equal(saved.filter.status.$ne, "completed");
  assert.equal(saved.options.runValidators, true);

  const second = responseRecorder();
  await updateAdminInquiryFollowUp({ params: { id: inquiryId }, body: { followUpAt: "2026-05-08" } }, second);
  assert.equal(second.body.data.followUpAt.toISOString(), "2026-05-08T00:00:00.000Z");
  assert.equal(inquiry.followUpAt.toISOString(), "2026-05-08T00:00:00.000Z");
});

test("admin can clear a follow-up date with null", async (t) => {
  restore(t, ["findOneAndUpdate"]);
  let updateSeen;
  Inquiry.findOneAndUpdate = async (_filter, update) => {
    updateSeen = update;
    return { _id: inquiryId, followUpAt: null, updatedAt: new Date() };
  };
  const res = responseRecorder();
  await updateAdminInquiryFollowUp({ params: { id: inquiryId }, body: { followUpAt: null } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.followUpAt, null);
  assert.equal(updateSeen.$set.followUpAt, null);
});

test("invalid, malformed, missing, and unexpected follow-up input is rejected before database writes", async (t) => {
  restore(t, ["findOneAndUpdate"]);
  Inquiry.findOneAndUpdate = () => assert.fail("invalid follow-up must not query for an update");
  for (const body of [
    { followUpAt: "2026-02-30" },
    { followUpAt: "2026-5-05" },
    { followUpAt: { year: 2026, month: 5, day: 5 } },
    { followUpAt: "2026-05-05", status: "completed" },
    {},
  ]) {
    const res = responseRecorder();
    await updateAdminInquiryFollowUp({ params: { id: inquiryId }, body }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  }
});

test("unauthenticated admin requests cannot change follow-up dates", async (t) => {
  const baseUrl = await listen(t);
  const response = await fetch(`${baseUrl}/api/admin/inquiries/${inquiryId}/follow-up`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: JSON.stringify({ followUpAt: "2026-05-05" }),
  });
  assert.equal(response.status, 401);
});

test("authenticated follow-up route enforces the origin check and accepts valid dates", async (t) => {
  restore(t, ["findOneAndUpdate"]);
  const originalSessionFind = AdminSession.findOne;
  t.after(() => { AdminSession.findOne = originalSessionFind; });
  const admin = { _id: adminId, email: "admin@example.invalid", role: "admin", isActive: true, credentialVersion: 0 };
  AdminSession.findOne = () => ({ populate: async () => ({
    _id: "isolated-session", credentialVersion: 0,
    expiresAt: new Date(Date.now() + 60_000), adminId: admin,
  }) });
  let writes = 0;
  Inquiry.findOneAndUpdate = async (_filter, update) => {
    writes += 1;
    return { _id: inquiryId, followUpAt: update.$set.followUpAt, updatedAt: new Date() };
  };

  const baseUrl = await listen(t);
  const send = (origin) => fetch(`${baseUrl}/api/admin/inquiries/${inquiryId}/follow-up`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json", Origin: origin,
      Cookie: "attelier_admin_session=isolated-session-token",
    },
    body: JSON.stringify({ followUpAt: "2026-05-05" }),
  });
  assert.equal((await send("https://untrusted.example")).status, 403);
  const accepted = await send("http://localhost:5173");
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).data.followUpAt, "2026-05-05T00:00:00.000Z");
  assert.equal(writes, 1);
});

test("public inquiry submission ignores follow-up fields and cannot write them", async (t) => {
  restore(t, ["create"]);
  let created;
  Inquiry.create = async (data) => { created = data; return { _id: inquiryId }; };
  const baseUrl = await listen(t);
  const response = await fetch(`${baseUrl}/api/inquiries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test Client", email: "test@example.invalid", service: "Other",
      message: "Please discuss a test project request.", followUpAt: "2026-05-05",
    }),
  });
  assert.equal(response.status, 201);
  assert.equal("followUpAt" in created, false);
});

test("completing an inquiry atomically clears its follow-up and preserves status activity", async (t) => {
  restore(t, ["findByIdAndUpdate"]);
  let state = { _id: inquiryId, status: "in-progress", followUpAt: parseCalendarDate("2026-05-05"), activity: [], updatedAt: new Date() };
  const updates = [];
  Inquiry.findByIdAndUpdate = async (_id, update) => {
    updates.push(update);
    state = { ...state, ...update.$set, activity: [...state.activity, update.$push.activity], updatedAt: new Date() };
    return state;
  };

  const complete = responseRecorder();
  await updateAdminInquiryStatus({ params: { id: inquiryId }, body: { status: "completed" }, admin: { id: adminId } }, complete);
  assert.equal(complete.statusCode, 200);
  assert.equal(state.followUpAt, null);
  assert.equal(state.activity[0].type, "status-changed");
  assert.equal(state.activity[0].status, "completed");
  assert.equal(state.activity[0].createdBy, adminId);
  assert.ok(state.activity[0].createdAt instanceof Date);
  assert.equal(updates[0].$set.followUpAt, null);

  const reopen = responseRecorder();
  await updateAdminInquiryStatus({ params: { id: inquiryId }, body: { status: "in-progress" }, admin: { id: adminId } }, reopen);
  assert.equal(state.followUpAt, null);
  assert.equal("followUpAt" in updates[1].$set, false);
  assert.deepEqual(state.activity.map(({ status }) => status), ["completed", "in-progress"]);
});

test("in-progress changes preserve an existing follow-up date", async (t) => {
  restore(t, ["findByIdAndUpdate"]);
  const followUpAt = parseCalendarDate("2026-05-05");
  let captured;
  Inquiry.findByIdAndUpdate = async (_id, update) => {
    captured = update;
    return { _id: inquiryId, status: "in-progress", followUpAt, updatedAt: new Date() };
  };
  const res = responseRecorder();
  await updateAdminInquiryStatus({ params: { id: inquiryId }, body: { status: "in-progress" }, admin: { id: adminId } }, res);
  assert.equal(res.body.data.followUpAt.toISOString(), followUpAt.toISOString());
  assert.equal("followUpAt" in captured.$set, false);
});

test("completed inquiries cannot be scheduled until reopened", async (t) => {
  restore(t, ["findOneAndUpdate", "findById"]);
  Inquiry.findOneAndUpdate = async () => null;
  Inquiry.findById = () => ({ select: async () => ({ status: "completed" }) });
  const res = responseRecorder();
  await updateAdminInquiryFollowUp({ params: { id: inquiryId }, body: { followUpAt: "2026-05-05" } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Reopen/);
});

test("dashboard follow-up counts use local calendar boundaries and exclude completed inquiries", async (t) => {
  restore(t, ["countDocuments", "find", "aggregate"]);
  const filters = [];
  Inquiry.countDocuments = async (filter) => { filters.push(filter); return filters.length; };
  Inquiry.find = () => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => [] });
  Inquiry.aggregate = async () => [];
  const res = responseRecorder();
  await getAdminOverview({ query: { today: "2026-05-05" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.followUps, { dueToday: 5, overdue: 6, upcoming: 7 });
  for (const filter of filters.slice(4, 7)) {
    assert.deepEqual(filter.status, { $in: ["new", "in-progress"] });
  }
  assert.equal(filters[4].followUpAt.$gte.toISOString(), "2026-05-05T00:00:00.000Z");
  assert.equal(filters[4].followUpAt.$lt.toISOString(), "2026-05-06T00:00:00.000Z");
  assert.equal(filters[5].followUpAt.$lt.toISOString(), "2026-05-05T00:00:00.000Z");
  assert.equal(filters[6].followUpAt.$gte.toISOString(), "2026-05-06T00:00:00.000Z");
});

test("follow-up filters combine with search, status, service, date bounds, and pagination", async (t) => {
  restore(t, ["find", "countDocuments"]);
  let queryDetails;
  const rows = [];
  Inquiry.countDocuments = async () => 0;
  Inquiry.find = (filter) => {
    queryDetails = { filter };
    return {
      sort(value) { queryDetails.sort = value; return this; },
      skip(value) { queryDetails.skip = value; return this; },
      limit(value) { queryDetails.limit = value; return this; },
      select() { return this; },
      lean: async () => rows,
    };
  };
  const res = responseRecorder();
  await listAdminInquiries({ query: {
    page: "2", pageSize: "5", search: "Ada.*", status: "new", service: "Other",
    fromDate: "2026-05-01", toDate: "2026-05-31", followUp: "due-today", today: "2026-05-05",
  } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.pagination, { page: 2, pageSize: 5, total: 0, totalPages: 0 });
  assert.deepEqual(queryDetails.sort, { createdAt: -1 });
  assert.equal(queryDetails.skip, 5);
  assert.equal(queryDetails.limit, 5);
  assert.equal(queryDetails.filter.status, "new");
  assert.equal(queryDetails.filter.service, "Other");
  assert.equal(queryDetails.filter.createdAt.$lt.toISOString(), "2026-06-01T00:00:00.000Z");
  assert.equal(queryDetails.filter.$and[0].$or[0].name.source, "Ada\\.\\*");
  assert.deepEqual(queryDetails.filter.$and[1].status, { $in: ["new", "in-progress"] });
  assert.equal(queryDetails.filter.$and[2].followUpAt.$gte.toISOString(), "2026-05-05T00:00:00.000Z");
});

test("all follow-up list categories have consistent date and completion behavior", async (t) => {
  restore(t, ["find", "countDocuments"]);
  const filters = [];
  mockFind(Inquiry, [], (filter) => filters.push(filter));
  for (const followUp of ["due-today", "overdue", "upcoming", "none"]) {
    const res = responseRecorder();
    await listAdminInquiries({ query: { followUp, today: "2026-05-05" } }, res);
    assert.equal(res.statusCode, 200);
  }
  for (const filter of filters.slice(0, 3)) {
    assert.deepEqual(filter.$and[0].status, { $in: ["new", "in-progress"] });
  }
  assert.deepEqual(filters[3].$and[0], { followUpAt: null });
  assert.equal("status" in filters[3], false, "no-follow-up includes completed inquiries by default");
});

test("invalid follow-up filter and invalid local date are rejected", async (t) => {
  restore(t, ["find", "countDocuments"]);
  Inquiry.find = () => assert.fail("invalid filters must not query inquiries");
  Inquiry.countDocuments = () => assert.fail("invalid filters must not count inquiries");
  for (const query of [
    { followUp: "later" },
    { followUp: "due-today", today: "2026-02-30" },
    { followUp: "overdue" },
  ]) {
    const res = responseRecorder();
    await listAdminInquiries({ query }, res);
    assert.equal(res.statusCode, 400);
  }
});

