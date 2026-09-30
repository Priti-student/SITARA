import request from "supertest";
import crypto from "node:crypto";
import { RoleName, UserStatus } from "@prisma/client";
import { prisma } from "../src/utils/prisma.js";
import { hashPassword } from "../src/utils/password.js";
import { createApp } from "../src/app.js";

export const app = createApp();
export const unique = crypto.randomBytes(4).toString("hex");
export const PASSWORD = "P5TestPass-2026!";

export type Session = { token: string };

export async function registerApplicant(email: string): Promise<Session> {
  const res = await request(app).post("/api/v1/auth/register").send({
    fullName: "P5 Applicant",
    email,
    password: PASSWORD,
    role: "APPLICANT",
  });
  return { token: res.body.data.accessToken };
}

export async function createOfficer(role: RoleName, departmentCode: string, suffix: string): Promise<Session> {
  const email = `${suffix}-${unique}@example.com`;
  const department = await prisma.department.findUnique({ where: { code: departmentCode } });
  await prisma.user.create({
    data: {
      fullName: `Officer ${suffix}`,
      email,
      passwordHash: await hashPassword(PASSWORD),
      isVerified: true,
      status: UserStatus.ACTIVE,
      departmentId: department?.id ?? null,
      roles: { create: [{ role: { connect: { name: role } } }] },
    },
  });
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  return { token: res.body.data.accessToken };
}

export async function fillAndSubmit(token: string, unitId: string, approvalCode: string, prefix: string) {
  const create = await request(app)
    .post("/api/v1/applications")
    .set("Authorization", `Bearer ${token}`)
    .send({ unitId, approvalTypeCode: approvalCode });
  const appId = create.body.data.application.id;

  const detail = await request(app)
    .get(`/api/v1/applications/${appId}`)
    .set("Authorization", `Bearer ${token}`);
  const reqs = detail.body.data.application.approvalType.requirements;
  for (const r of reqs) {
    const up = await request(app)
      .post(`/api/v1/applications/${appId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from(`%PDF ${prefix} ${r.documentType.code}`), `${r.documentType.code}.pdf`)
      .field("documentType", r.documentType.code);
    if (up.status !== 201) throw new Error(`upload ${r.documentType.code} -> ${up.status}`);
  }

  let formData: Record<string, unknown> = {};
  for (const f of detail.body.data.application.approvalType.formSchema) {
    if (f.required) formData[f.key] = f.type === "number" ? 5000 : f.options ? f.options[0] : "VALUE";
  }
  const form = await request(app)
    .put(`/api/v1/applications/${appId}/form`)
    .set("Authorization", `Bearer ${token}`)
    .send({ formData });
  if (form.status !== 200) throw new Error(`form -> ${form.status}`);

  const submit = await request(app)
    .post(`/api/v1/applications/${appId}/submit`)
    .set("Authorization", `Bearer ${token}`);
  if (submit.status !== 200) throw new Error(`submit -> ${submit.status}`);
  return appId;
}

export async function deptView(token: string, appId: string) {
  const res = await request(app)
    .get(`/api/v1/department/applications/${appId}`)
    .set("Authorization", `Bearer ${token}`);
  if (res.status !== 200) throw new Error(`deptView -> ${res.status}`);
  return res.body.data.application;
}

export async function applicantGet(token: string, appId: string) {
  const res = await request(app)
    .get(`/api/v1/applications/${appId}`)
    .set("Authorization", `Bearer ${token}`);
  if (res.status !== 200) throw new Error(`applicantGet -> ${res.status}`);
  return res.body.data.application;
}