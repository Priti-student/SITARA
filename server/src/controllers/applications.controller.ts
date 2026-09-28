import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/error.js";
import { currentUser } from "../middleware/auth.js";
import * as service from "../services/applications.service.js";

/** POST /api/v1/applications */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const input = service.createApplicationSchema.parse(req.body);
  const application = await service.createApplication(user.id, input);
  res.status(201).json({ success: true, data: { application } });
});

/** GET /api/v1/applications */
export const list = asyncHandler(async (_req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await service.listMine(user.id);
  res.json({ success: true, data });
});

/** GET /api/v1/applications/:id */
export const detail = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const application = await service.getById(user.id, String(req.params.id));
  res.json({ success: true, data: { application } });
});

/** PUT /api/v1/applications/:id/form */
export const updateForm = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const input = service.updateFormSchema.parse(req.body);
  const application = await service.updateForm(user.id, String(req.params.id), input.formData);
  res.json({ success: true, data: { application } });
});

/** POST /api/v1/applications/:id/documents (multipart: file, documentType, reuseForUnit) */
export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, error: { code: "FILE_REQUIRED", message: "Upload a file in the 'file' field" } });
    return;
  }
  const document = await service.uploadDocument(
    user.id,
    String(req.params.id),
    String(req.body.documentType ?? ""),
    { originalName: file.originalname ?? "file", mimeType: file.mimetype ?? "", sizeBytes: file.size ?? 0, buffer: file.buffer },
    String(req.body.reuseForUnit ?? "false") === "true"
  );
  res.status(201).json({ success: true, data: { document } });
});

/** POST /api/v1/applications/:id/documents/reuse */
export const reuseDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const document = await service.reuseDocument(
    user.id,
    String(req.params.id),
    String(req.body.documentType ?? ""),
    String(req.body.unitDocumentId ?? "")
  );
  res.status(201).json({ success: true, data: { document } });
});

/** DELETE /api/v1/applications/:id/documents/:docId */
export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await service.deleteDocument(user.id, String(req.params.id), String(req.params.docId));
  res.json({ success: true, data });
});

/** POST /api/v1/applications/:id/submit */
export const submit = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const application = await service.submitApplication(user.id, String(req.params.id));
  res.json({ success: true, data: { application } });
});

/** GET /api/v1/units/:id/documents (mounted in units router) */
export const listUnitDocuments = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await service.listUnitDocuments(user.id, String(req.params.id));
  res.json({ success: true, data });
});