import { api } from "./client";

export interface Unit {
  id: string;
  name: string;
  registrationNo: string | null;
  industryType: string | null;
  sector: string | null;
  establishmentType: string | null;
  state: string | null;
  district: string | null;
  address: string | null;
  pincode: string | null;
  employeeCount: number | null;
  capitalInvestment: number | null;
  isVerified: boolean;
  createdAt: string;
  members?: { userId: string; role: string }[];
  _count?: { checklists: number; members: number };
  checklists?: {
    id: string;
    name: string;
    status: string;
    riskCategory: string | null;
    createdAt: string;
  }[];
}

export function createUnit(input: { name: string } & Partial<Unit>): Promise<{ unit: Unit }> {
  return api<{ unit: Unit }>("/units", { method: "POST", body: input });
}

export function listUnits(): Promise<{ items: Unit[] }> {
  return api<{ items: Unit[] }>("/units");
}