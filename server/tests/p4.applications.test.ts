import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/utils/prisma.js";

const app = createApp();
const unique = crypto.randomBytes(4).toString("hex");
const email = `p4-${unique}@example.com`;
const password = "P4TestPass-2026!";

let token = "";
let unitId = "";
let applicationId = "";

const pdfA = Buffer.from("%PDF-1.4 DUMMY A industry registration");
const pdfB = Buffer.from("%PDF-1.4 DUMMY B land ownership");

describe("Phase 4 — applications, forms, documents", () => {
  beforeAll(async () => {
    await prisma.$connect();
    const reg = await request(app).post("/api/v1/auth/register").send({
      fullName: "P4 Applicant",
      email,
      password,
      role: "APPLICANT",
    });
    token = reg.body.data.accessToken;

    const unitRes = await request(app)
      .post("/api/v1/units")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "P4 Pharma Pvt Ltd",
        industryType: "pharmaceuticals",
        sector: "Pharmaceuticals",
        establishmentType: "factory",
        state: "Maharashtra",
        district: "Pune",
        employeeCount: 80,
        capitalInvestment: 50000000,
      });
    unitId = unitRes.body.data.unit.id;
  });

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) {
      const apps = await prisma.application.findMany({ where: { createdById: user.id }, select: { id: true } });
      if (apps.length > 0) {
        await prisma.application.deleteMany({ where: { id: { in: apps.map((a) => a.id) } } });
      }
      await prisma.notification.deleteMany({ where: { userId: user.id } });
      await prisma.unitMember.deleteMany({ where: { userId: user.id } });
      await prisma.unit.deleteMany({ where: { members: { none: {} } } });
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
    await prisma.$disconnect();
  });

  it("creates a DRAFT application with a number and guided form schema", async () => {
    const res = await request(app)
      .post("/api/v1/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ unitId, approvalTypeCode: "MPCB_CTE" });
    expect(res.status).toBe(201);
    expect(res.body.data.application.applicationNo).toMatch(/^APP-\d{8}-[0-9A-F]{4}$/);
    expect(res.body.data.application.status).toBe("DRAFT");

    const detail = await request(app)
      .get(`/api/v1/applications/${res.body.data.application.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detail.status).toBe(200);
    const approvalType = detail.body.data.application.approvalType;
    expect(Array.isArray(approvalType.formSchema)).toBe(true);
    expect(approvalType.formSchema.length).toBeGreaterThanOrEqual(10);
    expect(approvalType.requirements.length).toBeGreaterThanOrEqual(5);
    applicationId = res.body.data.application.id;
  });

  it("blocks submit when the form is empty (422 with missing-field labels)", async () => {
    const res = await request(app)
      .post(`/api/v1/applications/${applicationId}/submit`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INCOMPLETE_APPLICATION");
    expect(res.body.error.details.formErrors.length).toBeGreaterThan(0);
    expect(res.body.error.details.missingDocuments.length).toBeGreaterThan(0);
  });

  it("rejects a disallowed file type with pre-validation errors", async () => {
    const res = await request(app)
      .post(`/api/v1/applications/${applicationId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("MZ fake"), "installer.exe")
      .field("documentType", "industry_registration");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("DOCUMENT_INVALID");
    expect(res.body.error.details.validationErrors.length).toBeGreaterThan(0);
  });

  it("detects duplicate uploads by checksum", async () => {
    const first = await request(app)
      .post(`/api/v1/applications/${applicationId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", pdfA, "industry-registration.pdf")
      .field("documentType", "industry_registration");
    expect(first.status).toBe(201);

    const dup = await request(app)
      .post(`/api/v1/applications/${applicationId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", pdfA, "industry-registration-copy.pdf")
      .field("documentType", "industry_registration");
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("DUPLICATE_DOCUMENT");
  });

  it("uploads one document per required type, fills the guided form and submits", async () => {
    // Every required document type except industry_registration (uploaded above)
    const detail = await request(app)
      .get(`/api/v1/applications/${applicationId}`)
      .set("Authorization", `Bearer ${token}`);
    const requirements = detail.body.data.application.approvalType.requirements;
    const formSchema = detail.body.data.application.approvalType.formSchema;
    const alreadyUploaded = new Set(["industry_registration"]);

    for (const req of requirements) {
      const code = req.documentType.code;
      if (alreadyUploaded.has(code)) continue;
      const up = await request(app)
        .post(`/api/v1/applications/${applicationId}/documents`)
        .set("Authorization", `Bearer ${token}`)
        .attach("file", Buffer.from(`%PDF doc for ${code}`), `${code}.pdf`)
        .field("documentType", code);
      expect(up.status).toBe(201);
    }

    // Fill every required form field
    let formData: Record<string, unknown> = {};
    for (const field of formSchema) {
      if (field.required) {
        formData[field.key] =
          field.type === "number" ? 1000 : field.options ? field.options[0] : "TEST VALUE";
      }
    }
    const form = await request(app)
      .put(`/api/v1/applications/${applicationId}/form`)
      .set("Authorization", `Bearer ${token}`)
      .send({ formData });
    expect(form.status).toBe(200);

    // Now submit should succeed
    const submit = await request(app)
      .post(`/api/v1/applications/${applicationId}/submit`)
      .set("Authorization", `Bearer ${token}`);
    expect(submit.status).toBe(200);
    // Phase 5: submit synchronously activates the workflow → UNDER_SCRUTINY
    expect(submit.body.data.application.status).toBe("UNDER_SCRUTINY");
    expect(submit.body.data.application.submittedAt).toBeDefined();
  });

  it("locks edits after submission", async () => {
    const res = await request(app)
      .post(`/api/v1/applications/${applicationId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", pdfB, "extra.pdf")
      .field("documentType", "application");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("APPLICATION_LOCKED");
  });

  it("sent an application-submission notification", async () => {
    const notifs = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${token}`);
    const titles = notifs.body.data.items.map((n: { type: string }) => n.type);
    expect(titles).toContain("APPLICATION");
  });
});