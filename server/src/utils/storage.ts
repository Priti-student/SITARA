// ───────────────────────────────────────────────────────────────
// Upload storage helpers — multer (memory) + disk persistence.
// Files live under <cwd>/uploads/<applicationId>/… (gitignored).
// ───────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { MAX_UPLOAD_BYTES } from "./validators.js";

export const uploadsRoot = path.resolve(process.cwd(), "uploads");

/** Memory-backed upload middleware (size-limited). */
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES + 1024 },
});

/** Writes a buffer under uploads/<relativeDir>/<fileName>; returns the relative path. */
export function persistBuffer(
  buffer: Buffer,
  relativeDir: string,
  fileName: string
): string {
  const dir = path.join(uploadsRoot, relativeDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), buffer);
  return path.join("uploads", relativeDir, fileName).replaceAll("\\", "/");
}

/** Best-effort removal of a stored file. */
export function removeStored(relativePath: string): void {
  if (!relativePath || !relativePath.startsWith("uploads/")) return;
  try {
    fs.unlinkSync(path.resolve(process.cwd(), relativePath.replaceAll("/", path.sep)));
  } catch {
    // missing file is fine
  }
}