import Inquiry from "../models/Inquiry.js";
import { logSafeError } from "../utils/safeErrorLogger.js";
import { getCalendarDateRange } from "../utils/calendarDate.js";

export async function getAdminOverview(req, res) {
  const today = req.query.today || new Date().toISOString().slice(0, 10);
  const range = getCalendarDateRange(today);
  if (!range) return res.status(400).json({ success: false, message: "Enter a valid local calendar date." });

  try {
    const activeStatuses = { status: { $in: ["new", "in-progress"] } };
    const [total, newCount, inProgress, completed, dueToday, overdue, upcoming, highPriority, awaitingFirstResponse, firstResponseRecorded, recent, activity] = await Promise.all([
      Inquiry.countDocuments({}),
      Inquiry.countDocuments({ status: "new" }),
      Inquiry.countDocuments({ status: "in-progress" }),
      Inquiry.countDocuments({ status: "completed" }),
      Inquiry.countDocuments({ ...activeStatuses, followUpAt: { $gte: range.start, $lt: range.next } }),
      Inquiry.countDocuments({ ...activeStatuses, followUpAt: { $lt: range.start } }),
      Inquiry.countDocuments({ ...activeStatuses, followUpAt: { $gte: range.next } }),
      Inquiry.countDocuments({ priority: "high" }),
      Inquiry.countDocuments({ firstRespondedAt: null }),
      Inquiry.countDocuments({ firstRespondedAt: { $ne: null } }),
      Inquiry.find({})
        .sort({ createdAt: -1 })
        .limit(6)
        .select("name email service status priority firstRespondedAt followUpAt createdAt")
        .lean(),
      Inquiry.aggregate([
        { $unwind: "$activity" },
        { $sort: { "activity.createdAt": -1 } },
        { $limit: 8 },
        { $project: { name: 1, activity: 1 } },
      ]),
    ]);

    return res.json({
      success: true,
      data: {
        counts: { total, new: newCount, inProgress, completed },
        followUps: { dueToday, overdue, upcoming },
        leadTracking: { highPriority, awaitingFirstResponse, firstResponseRecorded },
        recent: recent.map((inquiry) => ({
          id: String(inquiry._id),
          name: inquiry.name,
          email: inquiry.email,
          service: inquiry.service,
          status: inquiry.status,
          priority: inquiry.priority || "normal",
          firstRespondedAt: inquiry.firstRespondedAt ?? null,
          followUpAt: inquiry.followUpAt ?? null,
          createdAt: inquiry.createdAt,
        })),
        activity: activity.map((item) => ({
          id: String(item.activity._id),
          inquiryId: String(item._id),
          inquiryName: item.name,
          type: item.activity.type,
          status: item.activity.status,
          priority: item.activity.priority,
          createdAt: item.activity.createdAt,
        })),
      },
    });
  } catch (error) {
    logSafeError("Admin dashboard load failed", error);
    return res.status(503).json({ success: false, message: "Unable to load dashboard data right now." });
  }
}
