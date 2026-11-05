import { logSafeError } from "../utils/safeErrorLogger.js";

export function notFoundHandler(_req, res) {
  return res.status(404).json({ success: false, message: "Route not found." });
}

export function apiErrorHandler(error, _req, res, next) {
  if (res.headersSent) return next(error);

  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Invalid JSON request body." });
  }
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "Request body is too large." });
  }
  if (error?.type === "charset.unsupported" || error?.type === "encoding.unsupported") {
    return res.status(415).json({ success: false, message: "Unsupported request body encoding." });
  }

  logSafeError("Unhandled API error", error);
  if (process.env.NODE_ENV === "production") {
    return res.status(500).json({ success: false, message: "Internal server error." });
  }

  return res.status(500).json({
    success: false,
    message: typeof error?.message === "string" && error.message ? error.message : "Internal server error.",
    ...(typeof error?.stack === "string" ? { stack: error.stack } : {}),
  });
}
