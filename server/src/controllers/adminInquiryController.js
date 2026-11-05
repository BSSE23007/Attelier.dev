import mongoose from "mongoose";
import { z } from "zod";
import Inquiry from "../models/Inquiry.js";
import { inquiryServices } from "./inquiryController.js";
import { logSafeError } from "../utils/safeErrorLogger.js";
import { getCalendarDateRange, parseCalendarDate } from "../utils/calendarDate.js";
import { buildDuplicateInquiryFilter, findPossibleDuplicateInquiries } from "../utils/duplicateInquiryMatching.js";

const inquiryStatuses = ["new", "in-progress", "completed"];
const inquiryPriorities = ["low", "normal", "high"];
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(""),
  status: z.enum(inquiryStatuses).optional(),
  service: z.enum(inquiryServices).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  followUp: z.enum(["due-today", "overdue", "upcoming", "none"]).optional(),
  priority: z.enum(inquiryPriorities).optional(),
  response: z.enum(["awaiting", "responded"]).optional(),
  today: z.string().optional(),
});
const statusSchema = z.object({ status: z.enum(inquiryStatuses) });
const prioritySchema = z.object({ priority: z.enum(inquiryPriorities) }).strict();
const firstResponseSchema = z.object({}).strict();
const noteSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const followUpSchema = z.object({
  followUpAt: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]),
}).strict();

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function serializeInquiry(inquiry, { includePrivate = false } = {}) {
  const serialized = {
    id: String(inquiry._id),
    name: inquiry.name,
    email: inquiry.email,
    service: inquiry.service,
    message: inquiry.message,
    status: inquiry.status,
    priority: inquiry.priority || "normal",
    firstRespondedAt: inquiry.firstRespondedAt ?? null,
    followUpAt: inquiry.followUpAt ?? null,
    createdAt: inquiry.createdAt,
    updatedAt: inquiry.updatedAt,
  };

  if (includePrivate) {
    serialized.notes = (inquiry.notes || []).map((note) => ({
      id: String(note._id),
      body: note.body,
      createdAt: note.createdAt,
      createdBy: note.createdBy?.email || "Administrator",
    }));
    serialized.activity = (inquiry.activity || []).map((item) => ({
      id: String(item._id),
      type: item.type,
      status: item.status,
      priority: item.priority,
      createdAt: item.createdAt,
      createdBy: item.createdBy?.email || "Administrator",
    }));
  }

  return serialized;
}

function validIdOrRespond(id, res) {
  if (mongoose.isValidObjectId(id)) return true;
  res.status(400).json({ success: false, message: "Invalid inquiry ID." });
  return false;
}

export async function listAdminInquiries(req, res) {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid inquiry filters." });
  }

  const { page, pageSize, search, status, service, fromDate, toDate, followUp, priority, response, today } = parsed.data;
  const filter = {};
  const clauses = [];
  if (status) filter.status = status;
  if (service) filter.service = service;
  if (priority === "normal") clauses.push({ $or: [{ priority: "normal" }, { priority: null }] });
  else if (priority) filter.priority = priority;
  if (response === "awaiting") clauses.push({ firstRespondedAt: null });
  if (response === "responded") clauses.push({ firstRespondedAt: { $ne: null } });

  const start = parseDate(fromDate);
  const end = parseDate(toDate);
  if ((fromDate && !start) || (toDate && !end) || (start && end && start > end)) {
    return res.status(400).json({ success: false, message: "Invalid date range." });
  }
  if (start || end) {
    filter.createdAt = {};
    if (start) filter.createdAt.$gte = start;
    if (end) {
      const endExclusive = new Date(end);
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
      filter.createdAt.$lt = endExclusive;
    }
  }
  if (search) {
    const expression = new RegExp(escapeRegExp(search), "i");
    const searchConditions = { $or: [
      { name: expression },
      { email: expression },
      { message: expression },
    ] };
    if (followUp || priority || response) clauses.push(searchConditions);
    else filter.$or = searchConditions.$or;
  }
  if (followUp === "none") {
    clauses.push({ followUpAt: null });
  } else if (followUp) {
    const range = getCalendarDateRange(today);
    if (!range) return res.status(400).json({ success: false, message: "A valid local calendar date is required for follow-up filters." });

    clauses.push({ status: { $in: ["new", "in-progress"] } });
    if (followUp === "due-today") clauses.push({ followUpAt: { $gte: range.start, $lt: range.next } });
    if (followUp === "overdue") clauses.push({ followUpAt: { $lt: range.start } });
    if (followUp === "upcoming") clauses.push({ followUpAt: { $gte: range.next } });
  }
  if (clauses.length) filter.$and = clauses;

  try {
    const [total, inquiries] = await Promise.all([
      Inquiry.countDocuments(filter),
      Inquiry.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .select("name email service message status priority firstRespondedAt followUpAt createdAt updatedAt")
        .lean(),
    ]);

    return res.json({
      success: true,
      data: inquiries.map((inquiry) => serializeInquiry(inquiry)),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    logSafeError("Admin inquiry list failed", error);
    return res.status(503).json({ success: false, message: "Unable to load inquiries right now." });
  }
}

export async function getAdminInquiry(req, res) {
  if (!validIdOrRespond(req.params.id, res)) return undefined;
  try {
    const inquiry = await Inquiry.findById(req.params.id)
      .populate("notes.createdBy", "email")
      .populate("activity.createdBy", "email")
      .lean();
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found." });
    let possibleDuplicates = [];
    const duplicateFilter = buildDuplicateInquiryFilter(inquiry);
    if (duplicateFilter) {
      try {
        const candidates = await Inquiry.find(duplicateFilter)
          .select("_id email service message createdAt status")
          .sort({ createdAt: -1 })
          .lean();
        possibleDuplicates = findPossibleDuplicateInquiries(inquiry, candidates);
      } catch (error) {
        logSafeError("Admin inquiry duplicate lookup failed", error);
      }
    }
    return res.json({ success: true, data: { ...serializeInquiry(inquiry, { includePrivate: true }), possibleDuplicates } });
  } catch (error) {
    logSafeError("Admin inquiry detail failed", error);
    return res.status(503).json({ success: false, message: "Unable to load inquiry details right now." });
  }
}

export async function updateAdminInquiryStatus(req, res) {
  if (!validIdOrRespond(req.params.id, res)) return undefined;
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid inquiry status." });

  try {
    const update = {
      $set: { status: parsed.data.status },
      $push: { activity: { type: "status-changed", status: parsed.data.status, createdBy: req.admin.id, createdAt: new Date() } },
    };
    if (parsed.data.status === "completed") update.$set.followUpAt = null;

    const inquiry = await Inquiry.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found." });

    return res.json({
      success: true,
      data: {
        id: String(inquiry._id),
        status: inquiry.status,
        followUpAt: inquiry.followUpAt ?? null,
        updatedAt: inquiry.updatedAt,
      },
    });
  } catch (error) {
    logSafeError("Admin inquiry status update failed", error);
    return res.status(503).json({ success: false, message: "Unable to update inquiry status right now." });
  }
}

export async function updateAdminInquiryPriority(req, res) {
  if (!validIdOrRespond(req.params.id, res)) return undefined;
  const parsed = prioritySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid inquiry priority." });

  try {
    const changedAt = new Date();
    const inquiry = await Inquiry.findOneAndUpdate(
      { _id: req.params.id, priority: { $ne: parsed.data.priority } },
      {
        $set: { priority: parsed.data.priority },
        $push: { activity: { type: "priority-changed", priority: parsed.data.priority, createdBy: req.admin.id, createdAt: changedAt } },
      },
      { new: true, runValidators: true },
    );
    if (inquiry) {
      return res.json({
        success: true,
        data: { id: String(inquiry._id), priority: inquiry.priority, updatedAt: inquiry.updatedAt },
      });
    }

    const current = await Inquiry.findById(req.params.id).select("priority updatedAt").lean();
    if (!current) return res.status(404).json({ success: false, message: "Inquiry not found." });
    return res.json({
      success: true,
      data: { id: String(current._id), priority: current.priority || "normal", updatedAt: current.updatedAt },
    });
  } catch (error) {
    logSafeError("Admin inquiry priority update failed", error);
    return res.status(503).json({ success: false, message: "Unable to update inquiry priority right now." });
  }
}

export async function markAdminInquiryResponded(req, res) {
  if (!validIdOrRespond(req.params.id, res)) return undefined;
  const parsed = firstResponseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid first-response request." });

  try {
    const timestamp = new Date();
    const inquiry = await Inquiry.findOneAndUpdate(
      { _id: req.params.id, firstRespondedAt: null },
      {
        $set: { firstRespondedAt: timestamp },
        $push: { activity: { type: "first-response-recorded", createdBy: req.admin.id, createdAt: timestamp } },
      },
      { new: true, runValidators: true },
    );
    if (inquiry) {
      return res.json({
        success: true,
        data: { id: String(inquiry._id), firstRespondedAt: inquiry.firstRespondedAt, updatedAt: inquiry.updatedAt },
      });
    }

    const current = await Inquiry.findById(req.params.id).select("firstRespondedAt updatedAt").lean();
    if (!current) return res.status(404).json({ success: false, message: "Inquiry not found." });
    return res.json({
      success: true,
      data: { id: String(current._id), firstRespondedAt: current.firstRespondedAt ?? null, updatedAt: current.updatedAt },
    });
  } catch (error) {
    logSafeError("Admin inquiry first response failed", error);
    return res.status(503).json({ success: false, message: "Unable to record the first response right now." });
  }
}

export async function updateAdminInquiryFollowUp(req, res) {
  if (!validIdOrRespond(req.params.id, res)) return undefined;
  const parsed = followUpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid follow-up date or null to clear it." });

  const followUpAt = parsed.data.followUpAt === null ? null : parseCalendarDate(parsed.data.followUpAt);
  if (parsed.data.followUpAt !== null && !followUpAt) {
    return res.status(400).json({ success: false, message: "Enter a valid follow-up date in YYYY-MM-DD format." });
  }

  try {
    const filter = { _id: req.params.id };
    if (followUpAt) filter.status = { $ne: "completed" };
    const inquiry = await Inquiry.findOneAndUpdate(
      filter,
      { $set: { followUpAt } },
      { new: true, runValidators: true },
    );
    if (!inquiry) {
      const current = await Inquiry.findById(req.params.id).select("status");
      if (!current) return res.status(404).json({ success: false, message: "Inquiry not found." });
      if (followUpAt && current.status === "completed") {
        return res.status(400).json({ success: false, message: "Reopen a completed inquiry before scheduling a follow-up." });
      }
      return res.status(409).json({ success: false, message: "The inquiry changed. Refresh and try again." });
    }

    return res.json({
      success: true,
      data: {
        id: String(inquiry._id),
        followUpAt: inquiry.followUpAt ?? null,
        updatedAt: inquiry.updatedAt,
      },
    });
  } catch (error) {
    logSafeError("Admin inquiry follow-up update failed", error);
    return res.status(503).json({ success: false, message: "Unable to update the follow-up date right now." });
  }
}

export async function addAdminInquiryNote(req, res) {
  if (!validIdOrRespond(req.params.id, res)) return undefined;
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a note of 1 to 2000 characters." });

  try {
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found." });

    const note = { body: parsed.data.body, createdBy: req.admin.id, createdAt: new Date() };
    inquiry.notes.push(note);
    inquiry.activity.push({ type: "note-added", createdBy: req.admin.id, createdAt: note.createdAt });
    await inquiry.save();
    const savedNote = inquiry.notes[inquiry.notes.length - 1];
    return res.status(201).json({
      success: true,
      data: { id: String(savedNote._id), body: savedNote.body, createdAt: savedNote.createdAt, createdBy: req.admin.email },
    });
  } catch (error) {
    logSafeError("Admin inquiry note failed", error);
    return res.status(503).json({ success: false, message: "Unable to save the note right now." });
  }
}

export const adminInquirySchemas = { querySchema, statusSchema, prioritySchema, firstResponseSchema, noteSchema };
