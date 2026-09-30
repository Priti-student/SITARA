import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { listUnits, type Unit } from "../api/units";
import {
  createClaim,
  inr,
  listSchemes,
  type EligibilityResult,
  type SchemeRow,
} from "../api/incentives";

function eligibilityChip(result: EligibilityResult | null) {
  if (!result) return <span className="chip chip-status-draft">not evaluated</span>;
  if (result.eligible) return <span className="chip chip-status-approved">eligible</span>;
  if (!result.windowOpen) return <span className="chip chip-status-rejected">window closed</span>;
  return <span className="chip chip-status-rejected">not eligible</span>;
}

function claimChip(status: string) {
  const cls =
    status === "REJECTED"
      ? "chip-status-rejected"
      : status === "DISBURSED"
        ? "chip-sla-soon"
        : status === "APPROVED" || status === "UTILISED"
          ? "chip-status-approved"
          : status === "UNDER_REVIEW"
            ? "chip-status-under_scrutiny"
            : "chip-status-submitted";
  return <span className={`chip ${cls}`}>{status.replaceAll("_", " ").toLowerCase()}</span>;
}

/** Live claims block a fresh filing; REJECTED lets the unit re-apply. */
function isBlocking(status: string | null | undefined): boolean {
  return !!status && status !== "REJECTED";
}

export function SchemesPage() {
  const { user } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [items, setItems] = useState<SchemeRow[] | null>(null);
  const [category, setCategory] = useState("ALL");
  const [open, setOpen] = useState<string | null>(null);
  const [filing, setFiling] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isOfficer =
    user?.roles.some((r) => ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"].includes(r)) ?? false;

  function load(uid: string) {
    setErr(null);
    listSchemes(uid ? { unitId: uid } : {})
      .then((r) => setItems(r.items))
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load schemes"));
  }

  useEffect(() => {
    listUnits()
      .then((r) => {
        setUnits(r.items);
        if (r.items.length > 0 && !unitId) setUnitId(r.items[0].id);
      })
      .catch(() => setUnits([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(unitId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  function openFiling(s: SchemeRow) {
    setFiling(filing === s.id ? null : s.id);
    setErr(null);
    setNotice(null);
    const suggested = s.maxAmountInr ? Math.min(s.maxAmountInr, 1_000_000) : 100_000;
    setAmount(String(suggested));
    setNotes("");
  }

  async function fileClaim(scheme: SchemeRow) {
    if (!unitId) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setErr("Enter a valid requested amount");
      return;
    }
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      const created = await createClaim({
        schemeId: scheme.id,
        unitId,
        requestedAmountInr: value,
        notes: notes.trim() || undefined,
      });
      setNotice(`Claim ${created.claim.id.slice(0, 8).toUpperCase()} filed for ${scheme.name} — track it under Claims.`);
      setFiling(null);
      load(unitId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to file the claim");
    } finally {
      setBusy(false);
    }
  }

  const categories = ["ALL", ...new Set((items ?? []).map((s) => s.category))];
  const visible = (items ?? []).filter((s) => category === "ALL" || s.category === category);
  const eligibleCount = (items ?? []).filter((s) => s.eligibility?.eligible).length;
  const claimedCount = (items ?? []).filter((s) => s.myClaim).length;

  if (!user) return null;

  return (
    <div className="page">
        <section className="welcome">
          <div className="module-title-row">
            <h1>Incentive Schemes</h1>
            <span>
              {unitId ? <span className="chip chip-status-approved">{eligibleCount} eligible</span> : null}{" "}
              <span className="chip chip-status-submitted">{(items ?? []).length} schemes</span>{" "}
              <span className="chip chip-sla-soon">{claimedCount} claimed</span>
            </span>
          </div>
          <p>
            Government incentives matched against your unit's profile — eligibility is evaluated live with
            every check shown (Phase 8). File a claim and track it from sanction to utilisation.
          </p>
        </section>

        {err ? <div className="alert alert-error">{err}</div> : null}
        {notice ? <div className="alert">{notice}</div> : null}

        <section className="wizard">
          <div className="module-title-row">
            <h3 className="stage-title">Scheme catalogue</h3>
            <span>
              {units.length > 0 ? (
                <label className="muted-text">
                  Evaluate for{" "}
                  <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="muted-text">browse only — no unit selected</span>
              )}
            </span>
          </div>

          <p className="filter-row">
            {categories.map((c) => (
              <button
                key={c}
                className={`btn btn-ghost btn-sm ${category === c ? "btn-selected" : ""}`}
                onClick={() => setCategory(c)}
              >
                {c === "ALL" ? "All categories" : c.replaceAll("_", " ")}
              </button>
            ))}
          </p>

          {items === null ? (
            <p className="muted-text">Loading schemes…</p>
          ) : visible.length === 0 ? (
            <p className="muted-text">No schemes in this category.</p>
          ) : (
            <div className="feature-grid">
              {visible.map((s) => {
                const ev = s.eligibility;
                const blocking = isBlocking(s.myClaim?.status);
                const canFile = !!unitId && !!ev?.eligible && ev.windowOpen && !blocking;
                return (
                  <div className="feature-card module-card" key={s.id}>
                    <div className="module-title-row">
                      <h3>{s.name}</h3>
                      <span className="badge">{s.category.replaceAll("_", " ")}</span>
                    </div>
                    <p className="muted-text">{s.authority}</p>
                    <p>{s.benefitSummary}</p>
                    <p className="muted-text">
                      {s.benefitType.replaceAll("_", " ")}
                      {s.maxAmountInr ? ` · ceiling ${inr(s.maxAmountInr)}` : ""}
                      {s.closesOn ? ` · window closes ${s.closesOn.slice(0, 10)}` : " · always open"}
                    </p>
                    <div className="filter-row">
                      {eligibilityChip(ev)}
                      {s.myClaim ? claimChip(s.myClaim.status) : null}
                    </div>
                    <div className="action-row">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setOpen(open === s.id ? null : s.id)}
                      >
                        {open === s.id ? "Hide checks" : "Why / Why not?"}
                      </button>
                      {canFile ? (
                        <button className="btn btn-primary btn-sm" onClick={() => openFiling(s)}>
                          {filing === s.id ? "Cancel" : "File claim"}
                        </button>
                      ) : s.myClaim && !blocking ? (
                        <button className="btn btn-primary btn-sm" onClick={() => openFiling(s)}>
                          {filing === s.id ? "Cancel" : "Re-apply"}
                        </button>
                      ) : null}
                    </div>

                    {open === s.id && ev ? (
                      <ul className="factor-list" style={{ marginTop: "0.6rem" }}>
                        {ev.checks.map((c) => (
                          <li key={c.key} className={c.passed ? undefined : "factor-hit"}>
                            <span>{c.passed ? "✓" : "✗"} {c.label}</span>
                            <span className="muted-text">
                              actual: {c.actual === null || c.actual === undefined ? "—" : String(c.actual)}
                            </span>
                          </li>
                        ))}
                        {!ev.windowOpen ? (
                          <li className="factor-hit">
                            <span>✗ application window</span>
                            <span className="muted-text">closed right now</span>
                          </li>
                        ) : null}
                        <li>
                          <span>documents</span>
                          <span className="muted-text">{s.requiredDocuments.join(", ") || "none"}</span>
                        </li>
                      </ul>
                    ) : null}

                    {filing === s.id && unitId ? (
                      <div className="claim-file-form" style={{ marginTop: "0.6rem" }}>
                        <label className="muted-text">
                          Requested amount (₹)
                          <input
                            type="number"
                            min={1}
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                          />
                        </label>
                        <label className="muted-text">
                          Notes
                          <textarea
                            rows={2}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Supporting context for the review officer…"
                          />
                        </label>
                        <div className="action-row">
                          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => fileClaim(s)}>
                            {busy ? "Filing…" : "Submit claim"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {isOfficer ? (
          <p className="dashboard-tip">
            Officers review claims under <Link to="/claims">Claims</Link> — disbursement sits with state/platform admins.
          </p>
        ) : null}
      </div>
  );
}
