import mongoose from "mongoose";
import { z } from "zod";
import Inquiry from "../models/Inquiry.js";
import { inquiryServices } from "./inquiryController.js";

const inquiryStatuses = ["new", "in-progress", "completed"];
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(""),
  status: z.enum(inquiryStatuses).optional(),
  service: z.enum(inquiryServices).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const statusSchema = z.object({ status: z.enum(inquiryStatuses) });
const noteSchema = z.object({ body: z.string().trim().min(1).max(2000) });

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

  const { page, pageSize, search, status, service, fromDate, toDate } = parsed.data;
  const filter = {};
  if (status) filter.status = status;
  if (service) filter.service = service;

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
    filter.$or = [
      { name: expression },
      { email: expression },
      { message: expression },
    ];
  }

  try {
    const [total, inquiries] = await Promise.all([
      Inquiry.countDocuments(filter),
      Inquiry.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .select("name email service message status createdAt updatedAt")
        .lean(),
    ]);

    return res.json({
      success: true,
      data: inquiries.map((inquiry) => serializeInquiry(inquiry)),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch {
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
    return res.json({ success: true, data: serializeInquiry(inquiry, { includePrivate: true }) });
  } catch {
    return res.status(503).json({ success: false, message: "Unable to load inquiry details right now." });
  }
}

export async function updateAdminInquiryStatus(req, res) {
  if (!validIdOrRespond(req.params.id, res)) return undefined;
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid inquiry status." });

  try {
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found." });

    inquiry.status = parsed.data.status;
    inquiry.activity.push({ type: "status-changed", status: parsed.data.status, createdBy: req.admin.id });
    await inquiry.save();
    return res.json({ success: true, data: { id: String(inquiry._id), status: inquiry.status, updatedAt: inquiry.updatedAt } });
  } catch {
    return res.status(503).json({ success: false, message: "Unable to update inquiry status right now." });
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
  } catch {
    return res.status(503).json({ success: false, message: "Unable to save the note right now." });
  }
}

export const adminInquirySchemas = { querySchema, statusSchema, noteSchema };
