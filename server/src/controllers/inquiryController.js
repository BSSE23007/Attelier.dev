
import { z } from "zod";
import Inquiry from "../models/Inquiry.js";
import { logSafeError } from "../utils/safeErrorLogger.js";
import { notifyNewInquiry } from "../services/inquiryEmailNotification.js";

export const inquiryServices = [
  "Web Development",
  "Cloud Engineering",
  "UI/UX & Graphic Design",
  "Technical Writing",
  "Other",
];

export const inquirySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).toLowerCase(),
  service: z.string().trim().pipe(z.enum(inquiryServices)),
  message: z.string().trim().min(10).max(3000),
});

export function createInquiryHandler({
  persistInquiry = (data) => Inquiry.create(data),
  notifyInquiry = notifyNewInquiry,
} = {}) {
  return async (req, res) => {
    try {
      const result = inquirySchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Please check your inquiry details.",
          errors: result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      const inquiry = await persistInquiry(result.data);

      try {
        await notifyInquiry(inquiry);
      } catch (error) {
        // Notification failure must not change the outcome of a persisted inquiry.
        logSafeError("InquiryEmailNotificationFailed", error);
      }

      return res.status(201).json({
        success: true,
        message: "Your project inquiry has been received!",
        inquiryId: inquiry._id,
      });
    } catch (error) {
      logSafeError("Inquiry creation failed", error);

      return res.status(500).json({
        success: false,
        message: "Unable to submit your inquiry right now.",
      });
    }
  };
}

export const createInquiry = createInquiryHandler();
