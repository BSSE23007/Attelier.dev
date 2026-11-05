import test from "node:test";
import assert from "node:assert/strict";
import Inquiry from "../src/models/Inquiry.js";
import { getAdminInquiry, listAdminInquiries, updateAdminInquiryStatus, addAdminInquiryNote } from "../src/controllers/adminInquiryController.js";
import { getAdminOverview } from "../src/controllers/adminOverviewController.js";

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

function restore(t, methodNames) {
  const originals = methodNames.map((name) => [name, Inquiry[name]]);
  t.after(() => originals.forEach(([name, original]) => { Inquiry[name] = original; }));
}

test("lists inquiries using search, status/service/date filters and bounded pagination", async (t) => {
  restore(t, ["find", "countDocuments"]);
  let capturedFilter;
  let capturedQuery;
  const rows = [{
    _id: inquiryId,
    name: "Ada Lovelace",
    email: "ada@example.com",
    service: "Web Development",
    message: "Website inquiry",
    status: "new",
    createdAt: new Date("2026-05-05T12:00:00Z"),
  }];
  Inquiry.countDocuments = async (filter) => { capturedFilter = filter; return 26; };
  Inquiry.find = (filter) => {
    capturedFilter = filter;
    capturedQuery = { filter, skipped: null, pageSize: null };
    return {
      sort() { return this; },
      skip(value) { capturedQuery.skipped = value; return this; },
      limit(value) { capturedQuery.pageSize = value; return this; },
      select() { return this; },
      lean: async () => rows,
    };
  };

  const res = responseRecorder();
  await listAdminInquiries({ query: {
    page: "2", pageSize: "25", search: "Ada.*", status: "new",
    service: "Web Development", fromDate: "2026-05-01", toDate: "2026-05-31",
  } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.pagination.total, 26);
  assert.equal(res.body.pagination.totalPages, 2);
  assert.equal(capturedQuery.skipped, 25);
  assert.equal(capturedQuery.pageSize, 25);
  assert.equal(capturedFilter.status, "new");
  assert.equal(capturedFilter.service, "Web Development");
  assert.match(capturedFilter.$or[0].name.source, /Ada\\\.\\\*/);
  assert.ok(capturedFilter.createdAt.$gte instanceof Date);
  assert.equal(capturedFilter.createdAt.$lt.toISOString(), "2026-06-01T00:00:00.000Z");
  assert.equal(res.body.data[0].id, inquiryId);
  assert.equal("notes" in res.body.data[0], false);
});

test("rejects invalid inquiry filters and date ranges", async (t) => {
  restore(t, ["find", "countDocuments"]);
  const statusResponse = responseRecorder();
  await listAdminInquiries({ query: { status: "arbitrary" } }, statusResponse);
  assert.equal(statusResponse.statusCode, 400);

  const dateResponse = responseRecorder();
  await listAdminInquiries({ query: { fromDate: "2026-02-30" } }, dateResponse);
  assert.equal(dateResponse.statusCode, 400);
});

test("returns inquiry detail and internal notes/activity only through admin detail API", async (t) => {
  restore(t, ["findById"]);
  Inquiry.findById = () => ({
    populate() { return this; },
    lean: async () => ({
      _id: inquiryId, name: "Ada", email: "ada@example.com", service: "Other",
      message: "Private project description", status: "new", notes: [{ _id: "note-id", body: "Internal note", createdBy: { email: "owner@example.com" }, createdAt: new Date() }],
      activity: [{ _id: "activity-id", type: "note-added", createdBy: { email: "owner@example.com" }, createdAt: new Date() }],
    }),
  });

  const res = responseRecorder();
  await getAdminInquiry({ params: { id: inquiryId } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.notes[0].body, "Internal note");
  assert.equal(res.body.data.activity[0].type, "note-added");
});

test("rejects invalid inquiry IDs before querying MongoDB", async (t) => {
  restore(t, ["findById"]);
  let queried = false;
  Inquiry.findById = () => { queried = true; };
  const res = responseRecorder();
  await getAdminInquiry({ params: { id: "not-an-object-id" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
});

test("changes only status and records administrator activity", async (t) => {
  restore(t, ["findByIdAndUpdate"]);
  const inquiry = { _id: inquiryId, name: "Ada", status: "new", activity: [], save: async function () { this.updatedAt = new Date(); } };
  let capturedUpdate;
  Inquiry.findByIdAndUpdate = async (_id, update) => {
    capturedUpdate = update;
    inquiry.status = update.$set.status;
    inquiry.activity.push(update.$push.activity);
    inquiry.updatedAt = new Date();
    return inquiry;
  };
  const res = responseRecorder();
  await updateAdminInquiryStatus({ params: { id: inquiryId }, body: { status: "in-progress" }, admin: { id: adminId } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(inquiry.name, "Ada");
  assert.equal(inquiry.status, "in-progress");
  assert.equal(inquiry.activity[0].type, "status-changed");
  assert.equal(String(inquiry.activity[0].createdBy), adminId);
  assert.equal("followUpAt" in capturedUpdate.$set, false);
});

test("rejects invalid status values", async (t) => {
  restore(t, ["findById"]);
  let queried = false;
  Inquiry.findById = () => { queried = true; };
  const res = responseRecorder();
  await updateAdminInquiryStatus({ params: { id: inquiryId }, body: { status: "deleted" }, admin: { id: adminId } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
});

test("adds trimmed internal notes with owner and activity metadata", async (t) => {
  restore(t, ["findById"]);
  const inquiry = {
    _id: inquiryId, notes: [], activity: [],
    async save() { this.notes[0]._id = "new-note-id"; },
  };
  Inquiry.findById = async () => inquiry;
  const res = responseRecorder();
  await addAdminInquiryNote({ params: { id: inquiryId }, body: { body: "  Follow up tomorrow.  " }, admin: { id: adminId, email: "owner@example.com" } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(inquiry.notes[0].body, "Follow up tomorrow.");
  assert.equal(String(inquiry.notes[0].createdBy), adminId);
  assert.equal(res.body.data.createdBy, "owner@example.com");
  assert.equal(inquiry.activity[0].type, "note-added");
});

test("rejects empty internal notes", async (t) => {
  restore(t, ["findById"]);
  let queried = false;
  Inquiry.findById = () => { queried = true; };
  const res = responseRecorder();
  await addAdminInquiryNote({ params: { id: inquiryId }, body: { body: "  " }, admin: { id: adminId } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
});

test("builds dashboard statistics and recent data from database results", async (t) => {
  restore(t, ["countDocuments", "find", "aggregate"]);
  const counts = [4, 2, 1, 1, 1, 2, 3, 2, 5, 1];
  Inquiry.countDocuments = async () => counts.shift();
  Inquiry.find = () => ({
    sort() { return this; }, limit() { return this; }, select() { return this; },
    lean: async () => [{ _id: inquiryId, name: "Ada", email: "ada@example.com", service: "Other", status: "new", createdAt: new Date() }],
  });
  Inquiry.aggregate = async () => [{ _id: inquiryId, name: "Ada", activity: { _id: "activity-id", type: "status-changed", status: "completed", createdAt: new Date() } }];
  const res = responseRecorder();
  await getAdminOverview({ query: { today: "2026-05-05" } }, res);
  assert.deepEqual(res.body.data.counts, { total: 4, new: 2, inProgress: 1, completed: 1 });
  assert.deepEqual(res.body.data.followUps, { dueToday: 1, overdue: 2, upcoming: 3 });
  assert.deepEqual(res.body.data.leadTracking, { highPriority: 2, awaitingFirstResponse: 5, firstResponseRecorded: 1 });
  assert.equal(res.body.data.recent[0].id, inquiryId);
  assert.equal(res.body.data.activity[0].status, "completed");
});
