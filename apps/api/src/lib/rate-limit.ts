import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";

type RateLimitOptions = Parameters<typeof rateLimit>[0];

/** Local load tests only — never enable in production. */
export function isLoadTestMode(): boolean {
  return (
    process.env.NODE_ENV !== "production" && process.env.LOAD_TEST_MODE === "true"
  );
}

/**
 * Rate limiters are created at import time (before dotenv). Wrap so LOAD_TEST_MODE
 * is evaluated per request, after env is loaded in index.ts.
 */
function createLimiter(options: RateLimitOptions): RequestHandler {
  const limiter = rateLimit(options);
  return (req, res, next) => {
    if (isLoadTestMode()) {
      next();
      return;
    }
    limiter(req, res, next);
  };
}

/** Public lead form — limit spam / abuse (5 per hour per IP). */
export const leadFormLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again later." }
});

/** General API rate limit */
export const generalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" }
});

/** Strict limit for auth write operations (sign-in, sign-up, password reset). */
export const authWriteLimiter = createLimiter({
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
