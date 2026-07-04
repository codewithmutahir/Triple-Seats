import rateLimit from "express-rate-limit";

/** Public lead form — limit spam / abuse (5 per hour per IP). */
export const leadFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again later." }
});

/** General API rate limit */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" }
});

/** Strict limit for auth write operations (sign-in, sign-up, password reset). */
export const authWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts" }
});

/** @deprecated Broad auth limiter — do not apply to all /api/auth routes. */
export const authLimiter = authWriteLimiter;

/** @deprecated Use leadFormLimiter — kept for backwards compatibility */
export const leadSubmitLimiter = leadFormLimiter;
