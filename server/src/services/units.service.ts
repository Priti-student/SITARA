// ───────────────────────────────────────────────────────────────
// Units service — industrial establishment profiles (Phase 3).
// ───────────────────────────────────────────────────────────────
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middleware/error.js";

export const createUnitSchema = z.object({
  name: z.string().min(2, "Unit name is required").max(200),
  registrationNo: z.string().max(60).optional(),
  industryType: z.string().max(100).optional(),
  sector: z.string().max(100).optional(),
  establishmentType: z.string().max(60).optional(),
  state: z.string().max(60).optional(),
  district: z.string().max(60).optional(),
  address: z.string().max(300).optional(),
  pincode: z.string().max(10).optional(),
  employeeCount: z.number().int().nonnegative().optional(),
  capitalInvestment: z.number().nonnegative().optional(),
});

export type CreateUnitInput = z.infer<typeof createUnitSchema>;

const PUBLIC_UNIT = {
  id: true,
  name: true,
  registrationNo: true,
  industryType: true,
  sector: true,
  establishmentType: true,
  state: true,
  district: true,
  address: true,
  pincode: true,
  employeeCount: true,
  capitalInvestment: true,
  isVerified: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function createUnit(userId: string, input: CreateUnitInput) {
  return prisma.unit.create({
    data: {
      ...input,
      members: { create: [{ userId, role: "OWNER" }] },
    },
    select: { ...PUBLIC_UNIT, members: { select: { userId: true, role: true } } },
  });
}

export async function listMine(userId: string) {
  return prisma.unit.findMany({
    where: { members: { some: { userId } } },
    select: {
      ...PUBLIC_UNIT,
      _count: { select: { checklists: true, members: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMine(userId: string, unitId: string) {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, members: { some: { userId } } },
    select: {
      ...PUBLIC_UNIT,
      checklists: {
        select: { id: true, name: true, status: true, riskCategory: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!unit) {
    throw new AppError({ message: "Unit not found", status: 404, code: "NOT_FOUND" });
  }
  return unit;
}

export async function assertOwnsUnit(userId: string, unitId: string): Promise<void> {
  const member = await prisma.unitMember.findUnique({
    where: { unitId_userId: { unitId, userId } },
  });
  if (!member) {
    throw new AppError({ message: "Unit not accessible", status: 403, code: "FORBIDDEN" });
  }
}