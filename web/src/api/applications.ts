import { api } from "./client";

export interface ApplicationSummary {
  id: string;
  applicationNo: string;
  status: string;
  riskCategory: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvalType: { code: string; name: string; stage: string };
  unit: { id: string; name: string };
  _count: { documents: number };
}

export interface FormField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
}

export interface RequiredDocument {
  id: string;
  documentType: { id: string; code: string; name: string };
}

export interface ApplicationDoc {
  id: string;
  documentType: { code: string; name: string };
  sourceType: string;
  originalName: string;
  sizeBytes: number;
  status: string;
  unitDocument: { id: string; isVerified: boolean } | null;
}

export interface ApplicationDetail {
  id: string;
  applicationNo: string;
  status: string;
  riskCategory: string | null;
  formData: Record<string, unknown>;
  createdAt: string;
  submittedAt: string | null;
  approvalType: {
    code: string;
    name: string;
    stage: string;
    description: string | null;
    formSchema: FormField[];
    requirements: RequiredDocument[];
  };
  unit: { id: string; name: string; registrationNo: string | null } | null;
  documents: ApplicationDoc[];
  checklistItem: { id: string; status: string } | null;
}

export interface UnitDocumentVault {
  id: string;
  originalName: string;
  isVerified: boolean;
  sizeBytes: number;
  documentType: { code: string; name: string };
}

export function createApplication(input: {
  unitId: string;
  approvalTypeCode: string;
  checklistItemId?: string;
}): Promise<{ application: { id: string; applicationNo: string } }> {
  return api("/applications", { method: "POST", body: input });
}

export function listApplications(): Promise<{ items: ApplicationSummary[] }> {
  return api("/applications");
}

export function getApplication(id: string): Promise<{ application: ApplicationDetail }> {
  return api(`/applications/${id}`);
}

export function saveApplicationForm(id: string, formData: Record<string, unknown>) {
  return api(`/applications/${id}/form`, { method: "PUT", body: { formData } });
}

export function submitApplication(id: string): Promise<{ application: ApplicationDetail }> {
  return api(`/applications/${id}/submit`, { method: "POST" });
}

export function listUnitDocuments(unitId: string): Promise<{ items: UnitDocumentVault[] }> {
  return api(`/units/${unitId}/documents`);
}

export function reuseVaultDocument(
  applicationId: string,
  documentType: string,
  unitDocumentId: string
) {
  return api(`/applications/${applicationId}/documents/reuse`, {
    method: "POST",
    body: { documentType, unitDocumentId },
  });
}

export function deleteApplicationDocument(applicationId: string, documentId: string) {
  return api(`/applications/${applicationId}/documents/${documentId}`, { method: "DELETE" });
}

/** Multipart upload — the browser sets the boundary, so no JSON content-type. */
export async function uploadApplicationDocument(
  applicationId: string,
  documentType: string,
  file: File
): Promise<{ document: ApplicationDoc }> {
  const form = new FormData();
  form.append("documentType", documentType);
  form.append("file", file);
  const res = await fetch(`/api/v1/applications/${applicationId}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${localStorage.getItem("sitara.accessToken") ?? ""}` },
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error ?? { code: "UNKNOWN", message: "Upload failed" };
    const e = new Error(err.message ?? "Upload failed");
    (e as { status?: number; code?: string; details?: unknown }).status = res.status;
    (e as { code?: string }).code = err.code;
    (e as { details?: unknown }).details = err.details;
    throw e;
  }
  return body;
}