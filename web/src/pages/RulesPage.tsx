import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  evaluateRules,
  listRules,
  type RuleListRow,
} from "../api/rules";

export function RulesPage() {
  const { user, signOut } = useAuth();
  const [rules, setRules] = useState<RuleListRow[]>([]);
  const [byType, setByType] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [evalOutput, setEvalOutput] = useState<string | null>(null);
  const [evalBusy, setEvalBusy] = useState(false);

  useEffect(() => {
    listRules()
      .then((d) => {
        setByType(d.byType);
        setRules(d.items);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load rules"))
      .finally(() => setLoading(false));
  }, []);

  async function runDemo() {
    setEvalBusy(true);
    setEvalOutput(null);
    try {
      const res = await evaluateRules({
        state: "Maharashtra",
        district: "Pune",
        industryType: "pharmaceuticals",
        employeeCount: 120,
        capitalInvestment: 75000000,
        pollution_relevant_activity: true,
        project_requires_environmental_clearance: true,
        consent_to_establish_obtained: true,
        existing_consent: true,
        building_or_industrial_activity_requires_fire_approval: true,
        clearance_type: ["environmental"],
      });
      const lines = [
        `• Risk classification : ${res.classification?.category ?? "none"} (${res.classification?.sourceRuleId ?? "—"})`,
        `• Applicable approvals : ${res.applicableApprovals.length}`,
        ...res.applicableApprovals.map((a) => `• ${a.approvalName} (${a.approvalCode}) — ${a.department}`),
        `• Workflow hints      : ${res.workflowHints.join(", ") || "none"}`,
      ];
      setEvalOutput(lines.join("\n"));
    } catch (e) {
      setEvalOutput(`Evaluation failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setEvalBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="topbar-brand">SITARA</div>
        <nav className="topbar-nav">
          <Link to="/dashboard" className="btn btn-ghost btn-sm">
            Dashboard
          </Link>
          <span className="chip chip-user">{user?.roles.join(", ") ?? ""}</span>
          <span className="chip chip-accent">{user?.email ?? ""}</span>
          <Link to="/" className="btn btn-ghost btn-sm" onClick={() => signOut()}>
            Sign out
          </Link>
        </nav>
      </header>

      <main>
        <section className="welcome">
          <h1>
            Regulatory <span className="accent">Knowledge Engine</span>
          </h1>
          <p>
            {rules.length} rules imported from <code>regulatory_rules.json</code>
            {Object.keys(byType).length > 0
              ? ` · ${Object.entries(byType)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}`
              : ""}
          </p>
        </section>

        {err ? <div className="alert alert-error">{err}</div> : null}

        <section className="features">
          <h2>Evaluate a sample industry profile</h2>
          <p style={{ color: "var(--muted)" }}>
            Runs the demo pharma-unit context through the engine
            (<code>POST /api/v1/rules/evaluate</code>).
          </p>
          <button className="btn btn-primary" onClick={runDemo} disabled={evalBusy}>
            {evalBusy ? "Evaluating…" : "Run demo evaluation"}
          </button>
          {evalOutput ? <pre className="eval-output">{evalOutput}</pre> : null}
        </section>

        <section className="rules-grid">
          <h2>Rule catalogue</h2>
          <table className="table rules-table">
            <thead>
              <tr>
                <th>Rule ID</th>
                <th>Type</th>
                <th>Approval</th>
                <th>Authority</th>
                <th>Department</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>Loading…</td>
                </tr>
              ) : (
                rules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <code>{r.ruleId}</code>
                    </td>
                    <td>{r.ruleType}</td>
                    <td>
                      {r.approval?.name ?? "—"}
                      <span className="badge">{r.approval?.code ?? "info"}</span>
                    </td>
                    <td>{r.authorityName}</td>
                    <td>{r.approval?.department ?? "—"}</td>
                    <td>
                      <span className="chip chip-user">{r.verificationStatus}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}