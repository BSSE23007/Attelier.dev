import { randomBytes } from "node:crypto";
import { z } from "zod";
import Admin from "../models/Admin.js";
import AdminSession from "../models/AdminSession.js";
import { ADMIN_SESSION_DURATION_MS, ADMIN_SESSION_COOKIE, adminCookieOptions, clearAdminCookie } from "../middleware/adminAuth.js";
import { createSessionToken, hashPassword, hashSessionToken, passwordHashNeedsRehash, passwordStrengthError, verifyPassword } from "../security/adminCredentials.js";
import { logSafeError } from "../utils/safeErrorLogger.js";

const loginSchema = z.object({
  email: z.string().trim().email().max(254).toLowerCase(),
  password: z.string().min(1).max(256),
});
const dummyPasswordHash = hashPassword(randomBytes(32).toString("hex"));

function credentialVersionFilter(version) {
  return version === 0
    ? { $or: [{ credentialVersion: 0 }, { credentialVersion: { $exists: false } }] }
    : { credentialVersion: version };
}

export async function loginAdmin(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Enter a valid email address and password." });
  }

  try {
    const admin = await Admin.findOne({ email: parsed.data.email }).select("+passwordHash");
    const storedHash = admin?.passwordHash || await dummyPasswordHash;
    const credentialVersion = admin?.credentialVersion ?? 0;
    const passwordMatches = await verifyPassword(parsed.data.password, storedHash);

    if (!admin?.isActive || admin.role !== "admin" || !passwordMatches) {
      return res.status(401).json({ success: false, message: "Email or password is incorrect." });
    }

    if (passwordHashNeedsRehash(storedHash)) {
      const strongerHash = await hashPassword(parsed.data.password);
      const migration = await Admin.updateOne(
        { _id: admin._id, passwordHash: storedHash, ...credentialVersionFilter(credentialVersion) },
        { $set: { passwordHash: strongerHash } }
      );
      if (migration.matchedCount !== 1) {
        return res.status(503).json({ success: false, message: "Unable to sign in right now." });
      }
    }

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_DURATION_MS);
    const session = await AdminSession.create({
      adminId: admin._id,
      tokenHash: hashSessionToken(token),
      credentialVersion,
      expiresAt,
    });

    const stillCurrent = await Admin.exists({
      _id: admin._id,
      ...credentialVersionFilter(credentialVersion),
    });
    if (!stillCurrent) {
      await AdminSession.deleteOne({ _id: session._id });
      return res.status(401).json({ success: false, message: "Email or password is incorrect." });
    }

    res.cookie(ADMIN_SESSION_COOKIE, token, adminCookieOptions());
    res.set("Cache-Control", "no-store");
    return res.json({
      success: true,
      admin: { email: admin.email },
      expiresAt,
    });
  } catch (error) {
    logSafeError("Admin login failed", error);
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
  } catch (error) {
    logSafeError("Admin logout failed", error);
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
    if ((req.admin.credentialVersion ?? 0) !== (admin.credentialVersion ?? 0)) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }
    if (!await verifyPassword(currentPassword, admin.passwordHash)) {
      return res.status(400).json({ success: false, message: "Current password is incorrect." });
    }

    const credentialVersion = admin.credentialVersion ?? req.admin.credentialVersion ?? 0;
    const passwordHash = await hashPassword(newPassword);
    const credentialUpdate = await Admin.updateOne(
      {
        _id: admin._id,
        passwordHash: admin.passwordHash,
        ...credentialVersionFilter(credentialVersion),
      },
      { $set: { passwordHash }, $inc: { credentialVersion: 1 } }
    );
    if (credentialUpdate.matchedCount !== 1) {
      return res.status(409).json({ success: false, message: "The password changed in another request. Sign in again and retry." });
    }

    // Version mismatch already revokes these sessions. Remove old rows as cleanup;
    // never let cleanup failure turn a committed credential update into a false failure.
    try {
      await AdminSession.deleteMany({ adminId: admin._id, credentialVersion: { $ne: credentialVersion + 1 } });
    } catch (error) {
      logSafeError("Old admin session cleanup failed", error);
      // Expiry and credential-version validation still prevent these sessions from authenticating.
    }
    clearAdminCookie(res);
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, message: "Password changed. Sign in again with your new password." });
  } catch (error) {
    logSafeError("Admin password change failed", error);
    return res.status(503).json({ success: false, message: "Unable to change the password right now." });
  }
}

export const adminLoginSchema = loginSchema;
