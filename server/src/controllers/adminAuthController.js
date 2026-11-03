import { randomBytes } from "node:crypto";
import { z } from "zod";
import Admin from "../models/Admin.js";
import AdminSession from "../models/AdminSession.js";
import { ADMIN_SESSION_DURATION_MS, ADMIN_SESSION_COOKIE, adminCookieOptions, clearAdminCookie } from "../middleware/adminAuth.js";
import { createSessionToken, hashPassword, hashSessionToken, passwordStrengthError, verifyPassword } from "../security/adminCredentials.js";

const loginSchema = z.object({
  email: z.string().trim().email().max(254).toLowerCase(),
  password: z.string().min(1).max(256),
});
const dummyPasswordHash = hashPassword(randomBytes(32).toString("hex"));

export async function loginAdmin(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Enter a valid email address and password." });
  }

  try {
    const admin = await Admin.findOne({ email: parsed.data.email }).select("+passwordHash");
    const storedHash = admin?.passwordHash || await dummyPasswordHash;
    const passwordMatches = await verifyPassword(parsed.data.password, storedHash);

    if (!admin?.isActive || admin.role !== "admin" || !passwordMatches) {
      return res.status(401).json({ success: false, message: "Email or password is incorrect." });
    }

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_DURATION_MS);
    await AdminSession.create({
      adminId: admin._id,
      tokenHash: hashSessionToken(token),
      expiresAt,
    });

    res.cookie(ADMIN_SESSION_COOKIE, token, adminCookieOptions());
    res.set("Cache-Control", "no-store");
    return res.json({
      success: true,
      admin: { email: admin.email },
      expiresAt,
    });
  } catch {
    return res.status(503).json({ success: false, message: "Unable to sign in right now." });
  }
}

export async function getAdminSession(req, res) {
  res.set("Cache-Control", "no-store");
  return res.json({
    success: true,
    admin: { email: req.admin.email },
    expiresAt: req.adminSessionExpiresAt,
  });
}

export async function logoutAdmin(req, res) {
  try {
    await AdminSession.deleteOne({ _id: req.adminSessionId });
    clearAdminCookie(res);
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, message: "Signed out." });
  } catch {
    return res.status(503).json({ success: false, message: "Unable to sign out right now." });
  }
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(1).max(256),
  confirmPassword: z.string().min(1).max(256),
});

export async function changeAdminPassword(req, res) {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Enter your current password and a valid new password." });
  }

  const { currentPassword, newPassword, confirmPassword } = parsed.data;
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, message: "The new password and confirmation do not match." });
  }

  const strengthError = passwordStrengthError(newPassword);
  if (strengthError) return res.status(400).json({ success: false, message: strengthError });

  try {
    const admin = await Admin.findById(req.admin.id).select("+passwordHash");
    if (!admin?.isActive || admin.role !== "admin") {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }
    if (!await verifyPassword(currentPassword, admin.passwordHash)) {
      return res.status(400).json({ success: false, message: "Current password is incorrect." });
    }

    const passwordHash = await hashPassword(newPassword);
    // Revoke before changing the credential so existing sessions are removed even if saving fails.
    await AdminSession.deleteMany({ adminId: admin._id });
    admin.passwordHash = passwordHash;
    await admin.save();
    // Catch sessions created with the old credential during a concurrent login race.
    await AdminSession.deleteMany({ adminId: admin._id });
    clearAdminCookie(res);
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, message: "Password changed. Sign in again with your new password." });
  } catch {
    return res.status(503).json({ success: false, message: "Unable to change the password right now." });
  }
}

export const adminLoginSchema = loginSchema;
