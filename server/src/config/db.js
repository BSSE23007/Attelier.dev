
import mongoose from "mongoose";
import { logSafeError } from "../utils/safeErrorLogger.js";

const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI
    );

    console.log("MongoDB connected.");
  } catch (error) {
    logSafeError("MongoDB connection failed", error);
    process.exit(1);
  }
};

export default connectDB;
