import { hashSessionToken } from "../security/adminCredentials.js";
import AdminSession from "../models/AdminSession.js";

export const ADMIN_SESSION_COOKIE = "attelier_admin_session";
export const ADMIN_SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export function adminCookieOptions() {
  const production = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    path: "/api/admin",
    maxAge: ADMIN_SESSION_DURATION_MS,
  };
}

export function clearAdminCookie(res) {
  const options = adminCookieOptions();
  delete options.maxAge;
  res.clearCookie(ADMIN_SESSION_COOKIE, options);
}

function readSessionToken(cookieHeader = "") {
  const pair = cookieHeader.split(";").map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  return pair?.slice(ADMIN_SESSION_COOKIE.length + 1) || null;
}

export async function requireAdmin(req, res, next) {
  const token = readSessionToken(req.headers.cookie);
  if (!token || token.length > 100) {
    clearAdminCookie(res);
    return res.status(401).json({ success: false, message: "Authentication required." });
  }

  try {
    const session = await AdminSession.findOne({
      tokenHash: hashSessionToken(token),
      expiresAt: { $gt: new Date() },
    }).populate("adminId", "email role isActive");

    if (!session || !session.adminId?.isActive || session.adminId.role !== "admin") {
      clearAdminCookie(res);
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    req.admin = {
      id: session.adminId._id,
      email: session.adminId.email,
      role: session.adminId.role,
    };
    req.adminSessionId = session._id;
    req.adminSessionExpiresAt = session.expiresAt;
    return next();
  } catch {
    return res.status(503).json({ success: false, message: "Admin service is temporarily unavailable." });
  }
}

export function requireTrustedOrigin(req, res, next) {
  const allowedOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
  if (req.get("origin") !== allowedOrigin) {
    return res.status(403).json({ success: false, message: "Request origin is not allowed." });
  }
  return next();
}
