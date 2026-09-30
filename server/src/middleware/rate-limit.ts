// ───────────────────────────────────────────────────────────────
// Rate limiting (Phase 10) — per-IP request throttling using the
// platform's standard JSON error envelope. Two limiters are wired
// into the app: a global /api/v1 budget and a stricter /api/v1/auth
// budget (slows credential stuffing / token brute-forcing).
// ───────────────────────────────────────────────────────────────
import { rateLimit, type RateLimitRequestHandler } from "express-rate-limit";
import { env } from "../config/env.js";

export interface RateLimiterOptions {
  windowMs: number;
  limit: number;
  /** Policy name surfaced in the RateLimit-* headers. */
  identifier: string;
}

/** Builds a limiter that rejects with `{ success:false, error:{code:"RATE_LIMITED"} }`. */
export function createRateLimiter(options: RateLimiterOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    identifier: options.identifier,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => {
      const info = (req as { rateLimit?: { resetTime?: Date } }).rateLimit;
      const resetSeconds = info?.resetTime
        ? Math.max(1, Math.ceil((info.resetTime.getTime() - Date.now()) / 1000))
        : Math.max(1, Math.ceil(options.windowMs / 1000));
      res.setHeader("Retry-After", String(resetSeconds));
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: `Too many requests — at most ${options.limit} per ${Math.round(options.windowMs / 1000)}s. Retry in ${resetSeconds}s.`,
        },
      });
    },
  });
}

/** Global per-IP budget applied to every /api/v1 route. */
export const apiRateLimiter = createRateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  identifier: "api",
});

/** Stricter per-IP budget for /api/v1/auth (login/refresh/registration). */
export const authRateLimiter = createRateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  identifier: "auth",
});