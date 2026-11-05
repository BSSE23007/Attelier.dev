import mongoose from "mongoose";

const adminSessionSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    credentialVersion: {
      type: Number,
      min: 0,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const AdminSession = mongoose.model("AdminSession", adminSessionSchema);

export default AdminSession;
