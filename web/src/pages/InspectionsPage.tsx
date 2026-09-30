import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { listInspections, type InspectionSummary } from "../api/inspections";

type Filter = "" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

function statusChip(status: string) {
  const cls =
    status === "COMPLETED"
      ? "chip-status-approved"
      : status === "CANCELLED"
        ? "chip-status-rejected"
        : status === "IN_PROGRESS"
          ? "chip-sla-soon"
          : "chip-status-under_scrutiny";
  return <span className={`chip ${cls}`}>{status.replace("_", " ")}</span>;
}

export function InspectionsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<InspectionSummary[] | null>(null);
  const [counts, setCounts] = useState<{ scheduled: number; active: number; completed: number; cancelled: number } | null>(null);
  const [filter, setFilter] = useState<Filter>("");
  const [mine, setMine] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isOfficer = user?.roles.some((r) =>
    ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN", "INSPECTOR"].includes(r)
  ) ?? false;

  function load() {
    listInspections({ status: filter || undefined, mine })
      .then((d) => {
        setItems(d.items);
        setCounts(d.counts);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load inspections"));
  }

  useEffect(load, [filter, mine]);

  if (!user) return null;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "", label: "All" },
    { key: "SCHEDULED", label: "Scheduled" },
    { key: "IN_PROGRESS", label: "In progress" },
    { key: "COMPLETED", label: "Completed" },
    { key: "CANCELLED", label: "Cancelled" },
  ];

  return (
    <div className="page">
        <section className="welcome">
          <div className="module-title-row">
            <h1>Joint inspections</h1>
            {counts ? (
              <span>
                <span className="chip chip-status-under_scrutiny">{counts.scheduled} scheduled</span>{" "}
                <span className="chip chip-sla-soon">{counts.active} in progress</span>{" "}
                <span className="chip chip-status-approved">{counts.completed} completed</span>
              </span>
            ) : null}
          </div>
          <p>
            Risk-based scrutiny in action — one site visit, every department, a single consolidated report.
          </p>
        </section>

        {err ? <div className="alert alert-error">{err}</div> : null}

        <section className="wizard">
          <div className="module-title-row">
            <h3 className="stage-title">Visits</h3>
            <span>
              {isOfficer ? (
                <button className={`btn btn-ghost btn-sm ${mine ? "active" : ""}`} onClick={() => setMine((m) => !m)}>
                  {mine ? "Showing: mine" : "My assignments"}
                </button>
              ) : null}
            </span>
          </div>
          <p className="filter-row">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`btn btn-ghost btn-sm ${filter === f.key ? "btn-selected" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </p>

          {items !== null && items.length > 0 ? (
            <table className="table rules-table">
              <thead>
                <tr>
                  <th>Inspection</th>
                  <th>Application</th>
                  <th>Unit</th>
                  <th>Departments</th>
                  <th>When</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.title}</strong>
                      {i.riskScoreAtScheduling !== null ? (
                        <>
                          <br />
                          <span className={`chip ${i.riskScoreAtScheduling >= 60 ? "chip-risk-high" : i.riskScoreAtScheduling >= 30 ? "chip-risk-medium" : "chip-risk-low"}`}>
                            risk {i.riskScoreAtScheduling}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {i.application.applicationNo}
                      <br />
                      <span className="hint">{i.application.approvalType.name}</span>
                    </td>
                    <td>
                      {i.application.unit.name}
                      <br />
                      <span className="hint">{i.application.unit.district ?? "—"}</span>
                    </td>
                    <td>{i.participants.map((p) => p.department.code).join(", ") || "—"}</td>
                    <td>{new Date(i.scheduledAt).toLocaleString()}</td>
                    <td>
                      {statusChip(i.status)}
                      {i.complianceStatus ? (
                        <>
                          <br />
                          <span className={`chip ${i.complianceStatus === "COMPLIANT" ? "chip-status-approved" : "chip-risk-high"}`}>
                            {i.complianceStatus}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <Link to={`/inspections/${i.id}`} className="btn btn-ghost btn-sm">Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <p className="hint">{items === null ? "Loading…" : "No inspections match this filter."}</p>
            </div>
          )}
        </section>
      </div>
  );
}

