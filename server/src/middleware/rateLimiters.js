import rateLimit from "express-rate-limit";

const commonOptions = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
};

export function createApiLimiter(overrides = {}) {
  return rateLimit({
    ...commonOptions,
    windowMs: 15 * 60 * 1000,
    limit: 100,
    ...overrides,
  });
}

export function createLoginLimiter(overrides = {}) {
  return rateLimit({
    ...commonOptions,
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: { success: false, message: "Too many login attempts. Please wait and try again." },
    ...overrides,
  });
}

export function createPasswordChangeLimiter(overrides = {}) {
  return rateLimit({
    ...commonOptions,
    windowMs: 15 * 60 * 1000,
    limit: 5,
    message: { success: false, message: "Too many password change attempts. Please wait and try again." },
    ...overrides,
  });
}
