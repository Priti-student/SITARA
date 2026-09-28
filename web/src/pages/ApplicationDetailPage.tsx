import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  getApplication,
  saveApplicationForm,
  submitApplication,
  uploadApplicationDocument,
  reuseVaultDocument,
  deleteApplicationDocument,
  listUnitDocuments,
  type ApplicationDetail,
  type ApplicationDoc,
  type UnitDocumentVault,
} from "../api/applications";

export function ApplicationDetailPage() {
  const { user, signOut } = useAuth();
  const params = useParams();
  const id = String(params.id);

  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [vault, setVault] = useState<UnitDocumentVault[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    getApplication(id)
      .then((d) => {
        setApp(d.application);
        setFormData(d.application.formData);
        const unitId = d.application.unit?.id;
        if (unitId) listUnitDocuments(unitId).then((v) => setVault(v.items)).catch(() => {});
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load application"));
  }

  useEffect(load, [id]);

  async function saveForm() {
    setBusy(true);
    setErr(null);
    try {
      await saveApplicationForm(id, formData);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function upload(docCode: string, file: File) {
    setBusy(true);
    setErr(null);
    try {
      await uploadApplicationDocument(id, docCode, file);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function reuse(docCode: string, vaultDocId: string) {
    setBusy(true);
    setErr(null);
    try {
      await reuseVaultDocument(id, docCode, vaultDocId);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reuse failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc(docId: string) {
    setErr(null);
    try {
      await deleteApplicationDocument(id, docId);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Remove failed");
    }
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await submitApplication(id);
      load();
    } catch (e) {
      const status = (e as { status?: number }).status;
      const details = (e as { details?: { formErrors?: string[]; missingDocuments?: { name: string }[] } }).details;
      if (status === 422 && details) {
        setErr(
          `${(details.formErrors ?? []).join("; ")}${(details.formErrors ?? []).length && (details.missingDocuments ?? []).length ? " · " : ""}${(details.missingDocuments ?? []).map((m) => `Missing: ${m.name}`).join("; ")}`
        );
      } else {
        setErr(e instanceof Error ? e.message : "Submit failed");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;
  if (err) {
    return (
      <div className="dashboard">
        <div className="alert alert-error">{err}</div>
        <Link to="/applications">← Back to applications</Link>
      </div>
    );
  }
  if (!app) return <div className="dashboard"><p>Loading…</p></div>;

  const locked = app.status !== "DRAFT" && app.status !== "QUERY_RESPONDED";
  const docsByType = new Map<string, ApplicationDoc[]>();
  for (const d of app.documents) {
    if (!docsByType.has(d.documentType.code)) docsByType.set(d.documentType.code, []);
    docsByType.get(d.documentType.code)!.push(d);
  }
  const vaultByType = new Map<string, UnitDocumentVault>();
  for (const v of vault) vaultByType.set(v.documentType.code, v);

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="topbar-brand">SITARA</div>
        <nav className="topbar-nav">
          <Link to="/dashboard" className="btn btn-ghost btn-sm">Dashboard</Link>
          <Link to="/applications" className="btn btn-ghost btn-sm">My Applications</Link>
          <span className="chip chip-user">{user.roles.join(", ")}</span>
          <Link to="/" className="btn btn-ghost btn-sm" onClick={() => signOut()}>Sign out</Link>
        </nav>
      </header>

      <main>
        <section className="welcome">
          <div className="module-title-row">
            <h1>{app.applicationNo}</h1>
            <span className={`chip chip-status-${app.status.toLowerCase()}`}>{app.status}</span>
          </div>
          <p>{app.approvalType.name} · {app.unit?.name ?? "—"}</p>
          {locked ? <p className="hint">This application is locked ({app.status}) — edits are disabled.</p> : null}
        </section>

        <section className="wizard">
          <h3 className="stage-title">1 · Guided application form</h3>
          <div className="form-grid">
            {app.approvalType.formSchema.length === 0 ? (
              <p className="hint">No form fields configured for this approval.</p>
            ) : (
              app.approvalType.formSchema.map((f) => (
                <label key={f.key} className="field">
                  <span>{f.label}{f.required ? " *" : ""}</span>
                  {f.type === "textarea" ? (
                    <textarea value={String(formData[f.key] ?? "")} onChange={(e) => setFormData((prev) => ({ ...prev, [f.key]: e.target.value }))} />
                  ) : f.type === "select" ? (
                    <select value={String(formData[f.key] ?? "")} onChange={(e) => setFormData((prev) => ({ ...prev, [f.key]: e.target.value }))}>
                      <option value="">Select…</option>
                      {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type={f.type === "number" ? "number" : "text"} value={String(formData[f.key] ?? "")} onChange={(e) => setFormData((prev) => ({ ...prev, [f.key]: e.target.value }))} />
                  )}
                </label>
              ))
            )}
            {!locked ? (
              <button className="btn btn-primary btn-block" onClick={saveForm} disabled={busy}>
                Save form (draft)
              </button>
            ) : null}
          </div>
        </section>

        <section className="wizard">
          <h3 className="stage-title">2 · Documents</h3>
          {app.approvalType.requirements.map((req) => {
            const code = req.documentType.code;
            const attached = docsByType.get(code) ?? [];
            const vaultDoc = vaultByType.get(code);
            return (
              <div key={code} className="approval-card">
                <h4>{req.documentType.name}</h4>
                {attached.map((d) => (
                  <div key={d.id} className="doc-row">
                    <span>{d.originalName} ({Math.round(d.sizeBytes / 1024)} KB · {d.sourceType === "REUSED" ? "reused from vault" : "uploaded"})</span>
                    {!locked ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => removeDoc(d.id)}>Remove</button>
                    ) : null}
                  </div>
                ))}
                {attached.length === 0 ? <p className="hint">Not attached yet.</p> : null}
                {!locked ? (
                  <div className="doc-actions">
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) upload(code, f);
                      }}
                    />
                    <span className="hint">Max 5 MB · PDF / images / office docs</span>
                    {vaultDoc ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => reuse(code, vaultDoc.id)}>
                        Reuse vault doc{vaultDoc.isVerified ? " ✓ verified" : ""}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>

        {!locked ? (
          <section className="wizard">
            <h3 className="stage-title">3 · Submit</h3>
            <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
              {busy ? "Working…" : "Submit application"}
            </button>
          </section>
        ) : null}
      </main>
    </div>
  );
}