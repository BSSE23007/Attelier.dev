import Inquiry from "../models/Inquiry.js";

export async function getAdminOverview(_req, res) {
  try {
    const [total, newCount, inProgress, completed, recent, activity] = await Promise.all([
      Inquiry.countDocuments({}),
      Inquiry.countDocuments({ status: "new" }),
      Inquiry.countDocuments({ status: "in-progress" }),
      Inquiry.countDocuments({ status: "completed" }),
      Inquiry.find({})
        .sort({ createdAt: -1 })
        .limit(6)
        .select("name email service status createdAt")
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
        recent: recent.map((inquiry) => ({
          id: String(inquiry._id),
          name: inquiry.name,
          email: inquiry.email,
          service: inquiry.service,
          status: inquiry.status,
          createdAt: inquiry.createdAt,
        })),
        activity: activity.map((item) => ({
          id: String(item.activity._id),
          inquiryId: String(item._id),
          inquiryName: item.name,
          type: item.activity.type,
          status: item.activity.status,
          createdAt: item.activity.createdAt,
        })),
      },
    });
  } catch {
    return res.status(503).json({ success: false, message: "Unable to load dashboard data right now." });
  }
}
