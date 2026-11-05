import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    singletonKey: {
      type: String,
      default: "primary-admin",
      unique: true,
      select: false,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    credentialVersion: {
      type: Number,
      min: 0,
      default: 0,
    },
    role: {
      type: String,
      enum: ["admin"],
      default: "admin",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const Admin = mongoose.model("Admin", adminSchema);

export default Admin;
