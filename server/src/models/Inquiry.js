
import mongoose from "mongoose";

const inquiryNoteSchema = new mongoose.Schema(
  {
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    createdAt: { type: Date, default: Date.now, required: true },
  },
  { _id: true }
);

const inquiryActivitySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["status-changed", "note-added", "priority-changed", "first-response-recorded"], required: true },
    status: { type: String, enum: ["new", "in-progress", "completed"] },
    priority: { type: String, enum: ["low", "normal", "high"] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    createdAt: { type: Date, default: Date.now, required: true },
  },
  { _id: true }
);

const inquirySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    service: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    status: {
      type: String,
      enum: ["new", "in-progress", "completed"],
      default: "new",
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high"],
      default: "normal",
    },
    firstRespondedAt: {
      type: Date,
      default: undefined,
    },
    // Calendar dates are represented as UTC midnight; a missing or null value means unscheduled.
    followUpAt: {
      type: Date,
      default: undefined,
    },
    notes: {
      type: [inquiryNoteSchema],
      default: [],
    },
    activity: {
      type: [inquiryActivitySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

inquirySchema.index({ status: 1, createdAt: -1 });
inquirySchema.index({ service: 1, createdAt: -1 });
inquirySchema.index({ "activity.createdAt": -1 });
inquirySchema.index({ followUpAt: 1, status: 1 });
inquirySchema.index({ priority: 1, createdAt: -1 });
inquirySchema.index({ firstRespondedAt: 1, status: 1 });

const Inquiry = mongoose.model("Inquiry", inquirySchema);

export default Inquiry;
