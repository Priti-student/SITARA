import { describe, expect, it } from "vitest";
import {
  isDuplicateChecksum,
  sha256Buffer,
  validateForm,
  validateUploadFile,
} from "../src/utils/validators.js";

const PDF = Buffer.from("%PDF-1.4 tiny-test-file");

describe("validateUploadFile", () => {
  it("accepts allowed types within limits", () => {
    const errors = validateUploadFile({
      originalName: "cert.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      buffer: PDF,
    });
    expect(errors).toEqual([]);
  });

  it("rejects disallowed extensions", () => {
    const errors = validateUploadFile({
      originalName: "virus.exe",
      mimeType: "application/octet-stream",
      sizeBytes: 100,
      buffer: PDF,
    });
    expect(errors.join(" ")).toContain("not allowed");
  });

  it("rejects mismatched MIME types", () => {
    const errors = validateUploadFile({
      originalName: "photo.pdf",
      mimeType: "text/html",
      sizeBytes: 100,
      buffer: PDF,
    });
    expect(errors.join(" ")).toContain("MIME type");
  });

  it("rejects empty files", () => {
    const errors = validateUploadFile({
      originalName: "empty.pdf",
      mimeType: "application/pdf",
      sizeBytes: 0,
      buffer: Buffer.alloc(0),
    });
    expect(errors.join(" ")).toContain("empty");
  });

  it("rejects oversize files (> 5 MB)", () => {
    const errors = validateUploadFile({
      originalName: "big.pdf",
      mimeType: "application/pdf",
      sizeBytes: 6 * 1024 * 1024,
      buffer: PDF,
    });
    expect(errors.join(" ")).toContain("5 MB");
  });
});

describe("sha256Buffer + duplicate detection", () => {
  it("derives a stable checksum and detects duplicates", () => {
    const a = sha256Buffer(PDF);
    const b = sha256Buffer(PDF);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(isDuplicateChecksum([a], b)).toBe(true);
    expect(isDuplicateChecksum([], a)).toBe(false);
    expect(isDuplicateChecksum([sha256Buffer(Buffer.from("other"))], a)).toBe(false);
  });
});

describe("validateForm", () => {
  const schema = [
    { key: "name", label: "Unit name", type: "text", required: true },
    { key: "capitalInvestment", label: "Capital investment", type: "number", required: true },
    { key: "notes", label: "Notes", type: "textarea", required: false },
  ];

  it("accepts a fully-filled form", () => {
    expect(validateForm(schema, { name: "X", capitalInvestment: 5000000 })).toEqual([]);
  });

  it("flags missing required fields with labels", () => {
    const errors = validateForm(schema, { name: "", capitalInvestment: undefined });
    expect(errors).toContain('"Unit name" is required');
    expect(errors).toContain('"Capital investment" is required');
  });

  it("ignores optional fields when absent", () => {
    expect(validateForm(schema, { name: "X", capitalInvestment: 1 })).toEqual([]);
  });

  it("tolerates a missing/empty schema", () => {
    expect(validateForm(null, { a: 1 })).toEqual([]);
    expect(validateForm([], { a: 1 })).toEqual([]);
  });
});