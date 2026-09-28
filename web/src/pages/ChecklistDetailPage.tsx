import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  getChecklist,
  updateItemStatus,
  type ChecklistDetail,
} from "../api/checklists";

const STAGE_LABELS: Record<string, string> = {
  pre_establishment: "1 · Pre-establishment",
  pre_operation: "2 · Pre-operation",
  operation: "3 · Operation",
  renewal: "4 · Renewal",
  post_operation: "5 · Post-operation",
  any: "General",
};

const ITEM_STATUS_ORDER = ["PENDING", "APPLIED", "APPROVED", "SKIPPED", "NOTED"];

export function ChecklistDetailPage() {
  const { user, signOut } = useAuth();
  const params = useParams();
  const checklistId = String(params.id);
  const [cl, setCl] = useState<ChecklistDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function load() {
    getChecklist(checklistId)
      .then((d) => setCl(d.checklist))
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load checklist"));
  }

  useEffect(load, [checklistId]);

  async function setStatus(itemId: string, status: string) {
    try {
      await updateItemStatus(checklistId, itemId, status);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    }
  }

  if (!user) return null;
  if (err) {
    return (
      <div className="dashboard">
        <div className="alert alert-error">{err}</div>
        <Link to="/checklists">← Back to my checklists</Link>
      </div>
    );
  }
  if (!cl) return <div className="dashboard"><p>Loading…</p></div>;

  const byStage = new Map<string, typeof cl.items>();
  for (const item of cl.items) {
    const stage = item.approvalType.stage;
    if (!byStage.has(stage)) byStage.set(stage, []);
    byStage.get(stage)!.push(item);
  }

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="topbar-brand">SITARA</div>
        <nav className="topbar-nav">
          <Link to="/dashboard" className="btn btn-ghost btn-sm">Dashboard</Link>
          <Link to="/checklists" className="btn btn-ghost btn-sm">My Checklists</Link>
          <span className="chip chip-user">{user.roles.join(", ")}</span>
          <Link to="/" className="btn btn-ghost btn-sm" onClick={() => signOut()}>Sign out</Link>
        </nav>
      </header>

      <main>
        <section className="welcome">
          <div className="module-title-row">
            <h1>{cl.name}</h1>
            <span className={`chip chip-risk-${(cl.riskCategory ?? "none").toLowerCase()}`}>{cl.riskCategory ?? "unclassified"} risk</span>
          </div>
          <p>
            {cl.unit?.name ? `${cl.unit.name} · ` : ""}Created {new Date(cl.createdAt).toLocaleString()} ·{" "}
            {cl.items.length} approvals
          </p>
        </section>

        <section className="wizard">
          {[...byStage.entries()].map(([stage, items]) => (
            <div key={stage} className="stage-group">
              <h3 className="stage-title">{STAGE_LABELS[stage] ?? stage}</h3>
              {items.map((item) => (
                <div key={item.id} className="approval-card">
                  <div className="module-title-row">
                    <h4>{item.approvalType.name}</h4>
                    <div className="module-title-row">
                      <span className="badge">{item.approvalType.code}</span>
                      <span className={`chip chip-status-${item.status.toLowerCase()}`}>{item.status}</span>
                    </div>
                  </div>
                  <p className="muted">
                    {item.approvalType.authority.name} · {item.approvalType.department.name} · {item.approvalType.authority.jurisdiction}
                  </p>
                  <div className="doc-list">
                    <strong>Required documents</strong>
                    <ul>
                      {item.documents.map((d) => (
                        <li key={d.code}>{d.name} <code>{d.code}</code></li>
                      ))}
                    </ul>
                  </div>
                  <div className="status-nav">
                    {ITEM_STATUS_ORDER.map((s) => (
                      <button key={s} className={`chip-btn ${item.status === s ? "selected" : ""}`} onClick={() => setStatus(item.id, s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}