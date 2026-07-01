import rateLimit from "express-rate-limit";

/** Public lead form — limit spam / abuse. */
export const leadSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again later." }
});
