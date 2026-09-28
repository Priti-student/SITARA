import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

/** Uniform application error carrying an HTTP status code. */
export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(options: {
    message: string;
    status?: number;
    code?: string;
    details?: unknown;
  }) {
    super(options.message);
    this.name = "AppError";
    this.status = options.status ?? 500;
    this.code = options.code ?? "APP_ERROR";
    this.details = options.details;
  }
}

/** Wraps an async controller so thrown errors reach the error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res, next).catch(next);
  };
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(
    new AppError({
      message: `Route not found: ${req.method} ${req.path}`,
      status: 404,
      code: "NOT_FOUND",
    })
  );
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // Express body-parser / HTTP-level errors carry a statusCode (e.g. malformed JSON)
  if (
    err &&
    typeof err === "object" &&
    Number.isInteger((err as { statusCode?: unknown }).statusCode) &&
    Number((err as { statusCode?: unknown }).statusCode) >= 400 &&
    Number((err as { statusCode?: unknown }).statusCode) < 500
  ) {
    const status = Number((err as { statusCode?: unknown }).statusCode);
    const message =
      (err as { type?: string }).type === "entity.parse.failed"
        ? "Request body is not valid JSON"
        : "Invalid request";
    res.status(status).json({
      success: false,
      error: { code: "BAD_REQUEST", message },
    });
    return;
  }

  // Unknown error — never leak internals
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
}