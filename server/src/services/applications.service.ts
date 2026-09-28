// ───────────────────────────────────────────────────────────────
// Applications service (Phase 4) — guided forms + documents +
// pre-validation + submit gating.
// ───────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middleware/error.js";
import { assertOwnsUnit } from "./units.service.js";
import { createNotification } from "./notifications.service.js";
import { persistBuffer, removeStored } from "../utils/storage.js";
import {
  isDuplicateChecksum,
  sanitizeFileName,
  sha256Buffer,
  validateForm,
  validateUploadFile,
  type UploadFileInfo,
} from "../utils/validators.js";

export const createApplicationSchema = z.object({
  unitId: z.string().min(1),
  approvalTypeCode: z.string().min(1),
  checklistItemId: z.string().optional(),
});

export const updateFormSchema = z.object({
  formData: z.record(z.string(), z.unknown()),
});

function applicationNo(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `APP-${y}${m}${day}-${rand}`;
}

export async function createApplication(
  userId: string,
  input: z.infer<typeof createApplicationSchema>
) {
  await assertOwnsUnit(userId, input.unitId);
  const approvalType = await prisma.approvalType.findUnique({
    where: { code: input.approvalTypeCode },
  });
  if (!approvalType) {
    throw new AppError({ message: "Unknown approval type", status: 404, code: "NOT_FOUND" });
  }

  let riskCategory: string | null = null;
  if (input.checklistItemId) {
    const item = await prisma.checklistItem.findUnique({
      where: { id: input.checklistItemId },
      include: { checklist: { select: { riskCategory: true } } },
    });
    if (item) {
      const owner = await prisma.checklist.findFirst({
        where: { id: item.checklistId, createdById: userId },
        select: { id: true },
      });
      if (!owner) {
        throw new AppError({ message: "Checklist item not accessible", status: 403, code: "FORBIDDEN" });
      }
      riskCategory = item.checklist.riskCategory;
    }
  }

  return prisma.application.create({
    data: {
      applicationNo: applicationNo(),
      approvalTypeId: approvalType.id,
      unitId: input.unitId,
      createdById: userId,
      checklistItemId: input.checklistItemId ?? null,
      formData: {},
      riskCategory,
      status: "DRAFT",
    },
  });
}

export async function listMine(userId: string) {
  const items = await prisma.application.findMany({
    where: { createdById: userId },
    select: {
      id: true,
      applicationNo: true,
      status: true,
      riskCategory: true,
      createdAt: true,
      submittedAt: true,
      approvalType: { select: { code: true, name: true, stage: true } },
      unit: { select: { id: true, name: true } },
      _count: { select: { documents: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { items };
}

export async function getById(userId: string, applicationId: string) {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, createdById: userId },
    include: {
      approvalType: {
        include: { requirements: { include: { documentType: true } } },
      },
      unit: { select: { id: true, name: true, registrationNo: true, industryType: true, district: true, state: true } },
      documents: {
        include: { documentType: true, unitDocument: { select: { id: true, isVerified: true } } },
        orderBy: { createdAt: "asc" },
      },
      checklistItem: { select: { id: true, status: true } },
    },
  });
  if (!application) {
    throw new AppError({ message: "Application not found", status: 404, code: "NOT_FOUND" });
  }
  return application;
}

export async function updateForm(
  userId: string,
  applicationId: string,
  formData: Record<string, unknown>
) {
  const application = await ownDraft(userId, applicationId);
  return prisma.application.update({
    where: { id: application.id },
    data: { formData: formData as object, updatedAt: new Date() },
  });
}

/** Loads an application the user owns while it is still editable. */
async function ownDraft(userId: string, applicationId: string) {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, createdById: userId },
    include: {
      approvalType: { include: { requirements: { include: { documentType: true } } } },
      unit: true,
    },
  });
  if (!application) {
    throw new AppError({ message: "Application not found", status: 404, code: "NOT_FOUND" });
  }
  if (application.status !== "DRAFT" && application.status !== "QUERY_RESPONDED") {
    throw new AppError({ message: `Application is ${application.status}; edits are locked`, status: 409, code: "APPLICATION_LOCKED" });
  }
  return application;
}

export async function uploadDocument(
  userId: string,
  applicationId: string,
  documentTypeCode: string,
  file: UploadFileInfo,
  reuseForUnit: boolean
) {
  const application = await ownDraft(userId, applicationId);
  const documentType = await prisma.documentType.findUnique({ where: { code: documentTypeCode } });
  if (!documentType) {
    throw new AppError({ message: "Unknown document type", status: 404, code: "NOT_FOUND" });
  }

  const validationErrors = validateUploadFile(file);
  if (validationErrors.length > 0) {
    throw new AppError({
      message: "Document pre-validation failed",
      status: 400,
      code: "DOCUMENT_INVALID",
      details: { validationErrors },
    });
  }

  const buffer = file.buffer ?? Buffer.alloc(0);
  const checksum = sha256Buffer(buffer);

  const existing = await prisma.applicationDocument.findMany({
    where: { applicationId: application.id, documentTypeId: documentType.id },
    select: { checksum: true },
  });
  if (isDuplicateChecksum(existing.map((d) => d.checksum), checksum)) {
    throw new AppError({
      message: "This file is already attached to the application",
      status: 409,
      code: "DUPLICATE_DOCUMENT",
    });
  }

  const storedPath = persistBuffer(
    buffer,
    application.id,
    `${crypto.randomUUID()}${crypto.randomBytes(2).toString("hex")}-${sanitizeFileName(file.originalName)}`
  );

  const created = await prisma.applicationDocument.create({
    data: {
      applicationId: application.id,
      documentTypeId: documentType.id,
      sourceType: "UPLOAD",
      originalName: sanitizeFileName(file.originalName),
      storedPath,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      checksum,
      status: "VALIDATED",
      validationErrors: [],
    },
    include: { documentType: true },
  });

  if (reuseForUnit) {
    await prisma.unitDocument.upsert({
      where: {
        unitId_documentTypeId: { unitId: application.unitId, documentTypeId: documentType.id },
      },
      update: {
        originalName: created.originalName,
        storedPath,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        checksum,
      },
      create: {
        unitId: application.unitId,
        documentTypeId: documentType.id,
        originalName: created.originalName,
        storedPath,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        checksum,
        isVerified: false,
      },
    });
  }

  return created;
}

export async function reuseDocument(
  userId: string,
  applicationId: string,
  documentTypeCode: string,
  unitDocumentId: string
) {
  const application = await ownDraft(userId, applicationId);
  const documentType = await prisma.documentType.findUnique({ where: { code: documentTypeCode } });
  const vault = await prisma.unitDocument.findFirst({
    where: { id: unitDocumentId, unitId: application.unitId },
  });
  if (!documentType || !vault) {
    throw new AppError({ message: "Vault document not found", status: 404, code: "NOT_FOUND" });
  }

  const existing = await prisma.applicationDocument.findMany({
    where: { applicationId: application.id, documentTypeId: documentType.id },
    select: { checksum: true },
  });
  if (isDuplicateChecksum(existing.map((d) => d.checksum), vault.checksum)) {
    throw new AppError({ message: "This vault document is already attached", status: 409, code: "DUPLICATE_DOCUMENT" });
  }

  return prisma.applicationDocument.create({
    data: {
      applicationId: application.id,
      documentTypeId: documentType.id,
      sourceType: "REUSED",
      unitDocumentId: vault.id,
      originalName: vault.originalName,
      storedPath: vault.storedPath,
      mimeType: vault.mimeType,
      sizeBytes: vault.sizeBytes,
      checksum: vault.checksum,
      status: "VALIDATED",
      validationErrors: [],
    },
    include: { documentType: true, unitDocument: { select: { id: true, isVerified: true } } },
  });
}

export async function deleteDocument(userId: string, applicationId: string, documentId: string) {
  const application = await ownDraft(userId, applicationId);
  const doc = await prisma.applicationDocument.findFirst({
    where: { id: documentId, applicationId: application.id },
  });
  if (!doc) {
    throw new AppError({ message: "Document not found", status: 404, code: "NOT_FOUND" });
  }
  await prisma.applicationDocument.delete({ where: { id: doc.id } });

  // Only delete the physical file if it is not shared with the unit vault
  if (doc.sourceType === "UPLOAD") {
    const shared = await prisma.unitDocument.count({ where: { storedPath: doc.storedPath } });
    if (shared === 0) removeStored(doc.storedPath);
  }
  return { success: true };
}

export async function listUnitDocuments(userId: string, unitId: string) {
  await assertOwnsUnit(userId, unitId);
  const items = await prisma.unitDocument.findMany({
    where: { unitId },
    include: { documentType: true },
    orderBy: { createdAt: "desc" },
  });
  return { items };
}

export async function submitApplication(userId: string, applicationId: string) {
  const application = await ownDraft(userId, applicationId);

  const docs = await prisma.applicationDocument.findMany({
    where: { applicationId: application.id },
    select: { documentTypeId: true },
  });
  const present = new Set(docs.map((d) => d.documentTypeId));

  const required = application.approvalType.requirements ?? [];
  const missingDocuments = required
    .filter((r) => !present.has(r.documentTypeId))
    .map((r) => ({ code: r.documentType.code, name: r.documentType.name }));

  const formErrors = validateForm(
    application.approvalType.formSchema,
    application.formData as Record<string, unknown>
  );

  if (formErrors.length > 0 || missingDocuments.length > 0) {
    throw new AppError({
      message: "Application is incomplete — fix the fields and attach all mandatory documents",
      status: 422,
      code: "INCOMPLETE_APPLICATION",
      details: { formErrors, missingDocuments },
    });
  }

  const updated = await prisma.application.update({
    where: { id: application.id },
    data: { status: "SUBMITTED", submittedAt: new Date(), updatedAt: new Date() },
  });

  await createNotification({
    userId,
    type: "APPLICATION",
    title: `Application ${updated.applicationNo} submitted`,
    message: `${updated.applicationNo} for ${application.approvalType.name} is now under departmental processing.`,
    data: { applicationId: updated.id },
  });

  return updated;
}