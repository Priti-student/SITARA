import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  createChecklist,
  previewChecklist,
  type EvaluationResultData,
} from "../api/checklists";
import { listUnits, type Unit } from "../api/units";

const STEPS = ["Location", "Industry", "Size", "Stage", "Review"];
const SECTORS = ["Pharmaceuticals", "Cement", "Textile", "Food Processing", "Chemicals", "Engineering", "Other"];
const ESTABLISHMENT_TYPES = ["factory", "workshop", "service", "warehouse", "other"];

const ACTIVITY_FLAGS: { key: string; label: string }[] = [
  { key: "pollution_relevant_activity", label: "Pollution-relevant activity (process emissions/effluents)" },
  { key: "project_requires_environmental_clearance", label: "Scheduled project requiring Environmental Clearance" },
  { key: "consent_to_establish_obtained", label: "Consent to Establish already obtained" },
  { key: "existing_consent", label: "Operating with an existing consent (renewal due)" },
  { key: "building_or_industrial_activity_requires_fire_approval", label: "Building / activity requires Fire NOC" },
];

export function CreateChecklistPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [name, setName] = useState("");
  const [context, setContext] = useState<Record<string, unknown>>({
    state: "Maharashtra",
    district: "Pune",
    sector: "Pharmaceuticals",
    industryType: "pharmaceuticals",
    establishmentType: "factory",
    employeeCount: 50,
    capitalInvestment: 25000000,
    stage: "pre_establishment",
    pollution_relevant_activity: true,
  });
  const [preview, setPreview] = useState<EvaluationResultData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listUnits().then((d) => setUnits(d.items)).catch(() => setUnits([]));
  }, []);

  function setCtx(key: string, value: unknown) {
    setContext((prev) => ({ ...prev, [key]: value }));
  }

  function toggleFlag(key: string) {
    setContext((prev) => ({ ...prev, [key]: !(prev[key] === true) }));
  }

  async function runPreview() {
    setBusy(true);
    setErr(null);
    try {
      setPreview(await previewChecklist(context));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await createChecklist({
        name: name || undefined,
        unitId: unitId || undefined,
        context,
      });
      navigate(`/checklists/${res.checklist.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save checklist");
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="page">
        <section className="welcome">
          <h1>
            Approval <span className="accent">Wizard</span>
          </h1>
          <p>
            Step {step + 1} of 5 — {STEPS[step]}. Answer a few questions; SITARA
            runs the Regulatory Knowledge Engine and builds your checklist.
          </p>
        </section>

        <section className="wizard">
          <div className="wizard-steps">
            {STEPS.map((label, i) => (
              <span key={label} className={`wizard-step ${i === step ? "current" : i < step ? "done" : ""}`}>
                {i + 1}. {label}
              </span>
            ))}
          </div>

          {step === 0 ? (
            <div className="form-grid">
              <label className="field"><span>State</span>
                <input value={String(context.state ?? "")} onChange={(e) => setCtx("state", e.target.value)} placeholder="Maharashtra" />
              </label>
              <label className="field"><span>District</span>
                <input value={String(context.district ?? "")} onChange={(e) => setCtx("district", e.target.value)} placeholder="Pune" />
              </label>
            </div>
          ) : step === 1 ? (
            <div className="form-grid">
              <label className="field"><span>Sector</span>
                <select value={String(context.sector ?? "")} onChange={(e) => { setCtx("sector", e.target.value); setCtx("industryType", e.target.value.toLowerCase()); }}>
                  {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="field"><span>Industry type (rule key)</span>
                <input value={String(context.industryType ?? "")} onChange={(e) => setCtx("industryType", e.target.value)} placeholder="pharmaceuticals" />
              </label>
              <label className="field"><span>Establishment type</span>
                <select value={String(context.establishmentType ?? "")} onChange={(e) => setCtx("establishmentType", e.target.value)}>
                  {ESTABLISHMENT_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
          ) : step === 2 ? (
            <div className="form-grid">
              <label className="field"><span>Planned/current employees</span>
                <input type="number" min={0} value={String(context.employeeCount ?? "")} onChange={(e) => setCtx("employeeCount", Number(e.target.value || 0))} />
              </label>
              <label className="field"><span>Capital investment (INR)</span>
                <input type="number" min={0} value={String(context.capitalInvestment ?? "")} onChange={(e) => setCtx("capitalInvestment", Number(e.target.value || 0))} />
              </label>
            </div>
          ) : step === 3 ? (
            <div className="form-grid">
              <label className="field"><span>Stage of operation</span>
                <select value={String(context.stage ?? "")} onChange={(e) => setCtx("stage", e.target.value)}>
                  <option value="pre_establishment">Pre-establishment (planning/land)</option>
                  <option value="pre_operation">Pre-operation (construction done)</option>
                  <option value="operation">Operating</option>
                  <option value="renewal">Renewal</option>
                </select>
              </label>
              <div className="field"><span>Applicability flags</span>
                {ACTIVITY_FLAGS.map((f) => (
                  <label key={f.key} className="check-row">
                    <input type="checkbox" checked={context[f.key] === true} onChange={() => toggleFlag(f.key)} />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="form-grid">
              <label className="field"><span>Link to unit (optional)</span>
                <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                  <option value="">— none —</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label className="field"><span>Checklist name (optional)</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pune pharma — pre-establishment" />
              </label>
              <button className="btn btn-primary btn-block" onClick={runPreview} disabled={busy}>
                {busy ? "Evaluating…" : "Preview checklist"}
              </button>
              {preview ? (
                <div className="preview-box">
                  <p>
                    <strong>Risk:</strong> {preview.classification?.category ?? "none"} ·
                    <strong>Approvals:</strong> {preview.applicableApprovals.length}
                  </p>
                  <ul>
                    {preview.applicableApprovals.map((a) => (
                      <li key={a.approvalCode}>{a.approvalName} <span className="badge">{a.approvalCode}</span> — {a.department}</li>
                    ))}
                  </ul>
                  <button className="btn btn-primary btn-block" onClick={save} disabled={busy}>
                    Save my checklist
                  </button>
                </div>
              ) : (
                <p className="hint">Hit “Preview checklist” above to see what the engine found, then save.</p>
              )}
            </div>
          )}
        {err ? <div className="alert alert-error">{err}</div> : null}

          <div className="wizard-nav">
            <button className="btn btn-ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
              Back
            </button>
            {step < 4 ? (
              <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Next</button>
            ) : null}
          </div>
        </section>
      </div>
  );
}