// ───────────────────────────────────────────────────────────────
// Pre-validation rules (Phase 4) — pure, deterministic, no I/O.
// ───────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import path from "node:path";

export const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"] as const;
export const MAX_UPLOAD_MB = 5;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

export interface UploadFileInfo {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer?: Buffer;
}

export function validateUploadFile(file: UploadFileInfo): string[] {
  const errors: string[] = [];
  const ext = path.extname(file.originalName).toLowerCase();

  if (!ext || !ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    errors.push(`File type "${ext || "(none)"}" is not allowed (allowed: ${ALLOWED_EXTENSIONS.join(", ")})`);
  }
  if (file.mimeType && !ALLOWED_MIMES.has(file.mimeType)) {
    errors.push(`MIME type "${file.mimeType}" is not allowed for upload`);
  }
  if (file.sizeBytes <= 0) {
    errors.push("Uploaded file is empty");
  }
  if (file.sizeBytes > MAX_UPLOAD_BYTES) {
    errors.push(`File exceeds the ${MAX_UPLOAD_MB} MB size limit`);
  }
  return errors;
}

export function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^A-Za-z0-9._-]/g, "_");
  return base.length > 80 ? base.slice(0, 80) : base;
}

export interface FormFieldDef {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
}

/** Returns labels of missing required fields. */
export function validateForm(
  formSchema: unknown,
  formData: Record<string, unknown>
): string[] {
  const fields = Array.isArray(formSchema) ? (formSchema as FormFieldDef[]) : [];
  const missing: string[] = [];
  for (const field of fields) {
    if (!field.required) continue;
    const value = formData[field.key];
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (typeof value === "number" && Number.isNaN(value));
    if (empty) missing.push(`"${field.label}" is required`);
  }
  return missing;
}

/** Duplicate detection within one application + document type. */
export function isDuplicateChecksum(
  existingChecksums: string[],
  checksum: string
): boolean {
  return existingChecksums.includes(checksum);
}