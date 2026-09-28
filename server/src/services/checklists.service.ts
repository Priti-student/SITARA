// ───────────────────────────────────────────────────────────────
// Checklists service — personalised approval checklist (Phase 3).
// Runs the knowledge engine, persists a snapshot + items, and
// notifies the applicant that their checklist is ready.
// ───────────────────────────────────────────────────────────────
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middleware/error.js";
import { getApplicableApprovals } from "../rules/engine.js";
import { assertOwnsUnit } from "./units.service.js";
import { createNotification } from "./notifications.service.js";

export const createChecklistSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  unitId: z.string().optional(),
  context: z.record(z.string(), z.unknown()),
});

export const updateItemSchema = z.object({
  status: z.enum(["PENDING", "APPLIED", "APPROVED", "SKIPPED", "NOTED"]),
});

export type ChecklistItemStatus = "PENDING" | "APPLIED" | "APPROVED" | "SKIPPED" | "NOTED";

function autoName(context: Record<string, unknown>, approvalCount: number): string {
  const sector = context.industryType ?? context.sector;
  const district = context.district ?? context.state;
  const base = sector ? String(sector) : "Industrial unit";
  const place = district ? ` – ${String(district)}` : "";
  return `${base}${place} — ${approvalCount} approvals`;
}

/** Dry-run: evaluate the knowledge base without persisting. */
export async function previewChecklist(context: Record<string, unknown>) {
  return getApplicableApprovals(context);
}

export async function createChecklist(
  userId: string,
  input: z.infer<typeof createChecklistSchema>
) {
  if (input.unitId) await assertOwnsUnit(userId, input.unitId);

  const result = await getApplicableApprovals(input.context);
  const name = input.name ?? autoName(input.context, result.applicableApprovals.length);

  // Resolve approval codes → ApprovalType rows for the item links
  const codes = result.applicableApprovals.map((a) => a.approvalCode);
  const types = await prisma.approvalType.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true, name: true },
  });
  const typeByCode = new Map(types.map((t) => [t.code, t.id]));

  const checklist = await prisma.checklist.create({
    data: {
      createdById: userId,
      unitId: input.unitId ?? null,
      name,
      context: input.context as unknown as Prisma.InputJsonValue,
      result: result as unknown as Prisma.InputJsonValue,
      riskCategory: result.classification?.category ?? null,
      items: {
        create: result.applicableApprovals
          .map((a, idx) => {
            const typeId = typeByCode.get(a.approvalCode);
            if (!typeId) return null;
            return {
              approvalTypeId: typeId,
              status: "PENDING" as ChecklistItemStatus,
              requiredDocuments: a.requiredDocuments as string[],
              position: idx,
            };
          })
          .filter((x): x is { approvalTypeId: string; status: ChecklistItemStatus; requiredDocuments: string[]; position: number } => x !== null),
      },
    },
    select: {
      id: true,
      name: true,
      status: true,
      riskCategory: true,
      unit: { select: { id: true, name: true } },
      items: { select: { id: true, status: true, position: true } },
    },
  });

  await createNotification({
    userId,
    type: "CHECKLIST_READY",
    title: "Your approval checklist is ready",
    message: `${name} — ${checklist.items.length} approvals identified. ${result.classification?.category ? `Risk category: ${result.classification.category}.` : ""}`,
    data: { checklistId: checklist.id },
  });

  return checklist;
}

/** Lists the user's checklists (with item + approval summaries). */
export async function listMine(userId: string) {
  return prisma.checklist.findMany({
    where: { createdById: userId },
    select: {
      id: true,
      name: true,
      status: true,
      riskCategory: true,
      createdAt: true,
      unit: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

interface ItemWithLabels {
  id: string;
  status: string;
  position: number;
  requiredDocuments: string[];
  approvalType: {
    code: string;
    name: string;
    stage: string;
    authority: { name: string; level: string; jurisdiction: string };
    department: { name: string };
  };
  documents: { code: string; name: string }[];
}

export async function getById(userId: string, checklistId: string) {
  const checklist = await prisma.checklist.findFirst({
    where: { id: checklistId, createdById: userId },
    include: {
      unit: { select: { id: true, name: true, district: true, state: true } },
      items: {
        include: {
          approvalType: { include: { authority: true, department: true } },
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!checklist) {
    throw new AppError({ message: "Checklist not found", status: 404, code: "NOT_FOUND" });
  }

  // Map required-document codes to friendly labels
  const allCodes = new Set<string>();
  for (const item of checklist.items) {
    for (const code of item.requiredDocuments as string[]) allCodes.add(code);
  }
  const docTypes = await prisma.documentType.findMany({
    where: { code: { in: [...allCodes] } },
    select: { code: true, name: true },
  });
  const labelByCode = new Map(docTypes.map((d) => [d.code, d.name]));

  const items: ItemWithLabels[] = checklist.items.map((item) => ({
    id: item.id,
    status: item.status,
    position: item.position,
    requiredDocuments: item.requiredDocuments as string[],
    approvalType: {
      code: item.approvalType.code,
      name: item.approvalType.name,
      stage: item.approvalType.stage,
      authority: {
        name: item.approvalType.authority.name,
        level: item.approvalType.authority.level,
        jurisdiction: item.approvalType.authority.jurisdiction,
      },
      department: { name: item.approvalType.department.name },
    },
    documents: (item.requiredDocuments as string[]).map((code) => ({
      code,
      name: labelByCode.get(code) ?? code,
    })),
  }));

  return {
    id: checklist.id,
    name: checklist.name,
    status: checklist.status,
    riskCategory: checklist.riskCategory,
    context: checklist.context,
    result: checklist.result,
    createdAt: checklist.createdAt,
    unit: checklist.unit,
    items,
  };
}

export async function updateItemStatus(
  userId: string,
  checklistId: string,
  itemId: string,
  status: ChecklistItemStatus
) {
  const checklist = await prisma.checklist.findFirst({
    where: { id: checklistId, createdById: userId },
    select: { id: true },
  });
  if (!checklist) {
    throw new AppError({ message: "Checklist not found", status: 404, code: "NOT_FOUND" });
  }
  const updated = await prisma.checklistItem.updateMany({
    where: { id: itemId, checklistId },
    data: { status },
  });
  if (updated.count === 0) {
    throw new AppError({ message: "Checklist item not found", status: 404, code: "NOT_FOUND" });
  }
  return { success: true };
}