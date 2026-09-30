import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  decideClaim,
  disburseClaim,
  getClaim,
  inr,
  listClaims,
  reviewClaim,
  utiliseClaim,
  type ClaimDetail,
  type ClaimListItem,
} from "../api/incentives";

function statusChip(status: string) {
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

const FILTERS = ["ALL", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "DISBURSED", "UTILISED"];

export function ClaimsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ClaimListItem[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("ALL");
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decideAmount, setDecideAmount] = useState("");
  const [decideNotes, setDecideNotes] = useState("");
  const [disburseRef, setDisburseRef] = useState("");
  const [utilNotes, setUtilNotes] = useState("");

  const isOfficer =
    user?.roles.some((r) => ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"].includes(r)) ?? false;

  function load(s: string) {
    setErr(null);
    listClaims(s === "ALL" ? {} : { status: s })
      .then((r) => {
        setItems(r.items);
        setCounts(r.counts);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load claims"));
  }

  useEffect(() => {
    load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    setErr(null);
    getClaim(id)
      .then((d) => {
        setDetail(d);
        setDecideAmount(String(d.claim.requestedAmountInr));
        setDecideNotes(d.claim.decisionNotes ?? "");
        setDisburseRef("");
        setUtilNotes("");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load the claim"));
  }

  /** Runs a lifecycle action, then refreshes both the list and the open detail. */
  async function act(label: string, run: () => Promise<{ claim: { id: string } }>) {
    if (!detail) return;
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      const r = await run();
      setNotice(`${label} — claim ${r.claim.id.slice(0, 8).toUpperCase()}.`);
      load(status);
      const fresh = await getClaim(detail.claim.id);
      setDetail(fresh);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  }

  const totalRequested = (items ?? []).reduce((sum, c) => sum + c.requestedAmountInr, 0);
  const totalApproved = (items ?? []).reduce((sum, c) => sum + (c.approvedAmountInr ?? 0), 0);

  if (!user) return null;

  return (
    <div className="page">
        <section className="welcome">
          <div className="module-title-row">
            <h1>Incentive Claims</h1>
            <span>
              <span className="chip chip-status-submitted">{(items ?? []).length} shown</span>{" "}
              <span className="chip chip-status-approved">{inr(totalApproved)} sanctioned</span>{" "}
              <span className="chip chip-sla-soon">{inr(totalRequested)} requested</span>
            </span>
          </div>
          <p>
            SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED → DISBURSED → UTILISED. Officers review and
            sanction; state/platform admins disburse; the unit records how the money was used.
          </p>
        </section>

        {err ? <div className="alert alert-error">{err}</div> : null}
        {notice ? <div className="alert">{notice}</div> : null}

        <section className="wizard">
          <div className="module-title-row">
            <h3 className="stage-title">{isOfficer ? "Review queue" : "My claims"}</h3>
            <span className="muted-text">every transition is audit-logged &amp; notified</span>
          </div>

          <p className="filter-row">
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`btn btn-ghost btn-sm ${status === f ? "btn-selected" : ""}`}
                onClick={() => setStatus(f)}
              >
                {f === "ALL" ? "All" : f.replaceAll("_", " ")}
                {f !== "ALL" && counts[f] !== undefined ? ` (${counts[f]})` : ""}
              </button>
            ))}
          </p>

          {items === null ? (
            <p className="muted-text">Loading claims…</p>
          ) : items.length === 0 ? (
            <p className="muted-text">
              No claims here — file one from the <Link to="/schemes">scheme catalogue</Link>.
            </p>
          ) : (
            <table className="table rules-table">
              <thead>
                <tr>
                  <th>Scheme</th>
                  {isOfficer ? <th>Unit</th> : null}
                  <th>Requested</th>
                  <th>Sanctioned</th>
                  <th>Status</th>
                  <th>Filed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>{c.scheme?.name ?? c.schemeId}</td>
                    {isOfficer ? <td>{c.unit?.name ?? c.unitId}</td> : null}
                    <td>{inr(c.requestedAmountInr)}</td>
                    <td>{c.approvedAmountInr !== null ? inr(c.approvedAmountInr) : <span className="muted-text">—</span>}</td>
                    <td>{statusChip(c.status)}</td>
                    <td>{c.createdAt.slice(0, 10)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggle(c.id)}>
                        {openId === c.id ? "Close" : "Details"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {openId && detail ? (
          <section className="form-card risk-panel" aria-live="polite">
            <div className="module-title-row">
              <h3>{detail.scheme.name} · {detail.unit.name}</h3>
              {statusChip(detail.claim.status)}
            </div>
            <p className="muted-text">
              Requested {inr(detail.claim.requestedAmountInr)}
              {detail.claim.approvedAmountInr !== null ? ` · sanctioned ${inr(detail.claim.approvedAmountInr)}` : ""}
              {detail.claim.disbursementRef ? ` · ref ${detail.claim.disbursementRef}` : ""}
              {detail.claim.notes ? ` · "${detail.claim.notes}"` : ""}
            </p>

            <h4 className="stage-title">Audit timeline</h4>
            <ul className="factor-list">
              {detail.events.map((ev) => (
                <li key={ev.id}>
                  <span>{ev.eventType.replaceAll("_", " ").toLowerCase()}</span>
                  <span className="muted-text">
                    {ev.createdAt.slice(0, 16).replace("T", " ")} · {ev.actorRole}
                    {ev.comment ? ` — ${ev.comment}` : ""}
                  </span>
                </li>
              ))}
            </ul>

            {detail.can.review ? (
              <div className="action-row">
                <button
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={() => act("Review started", () => reviewClaim(detail.claim.id))}
                >
                  {busy ? "Working…" : "Start review"}
                </button>
              </div>
            ) : null}

            {detail.can.decide ? (
              <div className="claim-file-form">
                <label className="muted-text">
                  Sanctioned amount (₹)
                  <input
                    type="number"
                    min={0}
                    value={decideAmount}
                    onChange={(e) => setDecideAmount(e.target.value)}
                  />
                </label>
                <label className="muted-text">
                  Decision notes
                  <textarea
                    rows={2}
                    value={decideNotes}
                    onChange={(e) => setDecideNotes(e.target.value)}
                    placeholder="Sanction letter number, conditions, or rejection reasons…"
                  />
                </label>
                <div className="action-row">
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() =>
                      act("Claim approved", () =>
                        decideClaim(detail.claim.id, {
                          approved: true,
                          amountInr: Number(decideAmount),
                          notes: decideNotes.trim() || undefined,
                        }),
                      )
                    }
                  >
                    Approve
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() =>
                      act("Claim rejected", () =>
                        decideClaim(detail.claim.id, { approved: false, notes: decideNotes.trim() || undefined }),
                      )
                    }
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : null}

            {detail.can.disburse ? (
              <div className="claim-file-form">
                <label className="muted-text">
                  Disbursement reference (UTR)
                  <input
                    type="text"
                    value={disburseRef}
                    onChange={(e) => setDisburseRef(e.target.value)}
                    placeholder="e.g. UTR-2026-000123"
                  />
                </label>
                <div className="action-row">
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy || !disburseRef.trim()}
                    onClick={() => act("Disbursed", () => disburseClaim(detail.claim.id, disburseRef.trim()))}
                  >
                    Mark disbursed
                  </button>
                </div>
              </div>
            ) : null}

            {detail.can.utilise ? (
              <div className="claim-file-form">
                <label className="muted-text">
                  Utilisation notes
                  <textarea
                    rows={2}
                    value={utilNotes}
                    onChange={(e) => setUtilNotes(e.target.value)}
                    placeholder="What the funds were spent on…"
                  />
                </label>
                <div className="action-row">
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy || !utilNotes.trim()}
                    onClick={() => act("Utilisation recorded", () => utiliseClaim(detail.claim.id, utilNotes.trim()))}
                  >
                    Record utilisation
                  </button>
                </div>
              </div>
            ) : null}

            {!detail.can.review && !detail.can.decide && !detail.can.disburse && !detail.can.utilise ? (
              <p className="muted-text">
                {detail.claim.status === "UTILISED"
                  ? "Lifecycle complete — nothing further to do."
                  : detail.claim.status === "REJECTED"
                    ? "Rejected — the unit may re-apply from the scheme catalogue."
                    : "No actions available to your role at this stage."}
              </p>
            ) : null}
          </section>
        ) : openId ? (
          <section className="form-card risk-panel">
            <p className="muted-text">Loading claim…</p>
          </section>
        ) : null}
      </div>
  );
}
