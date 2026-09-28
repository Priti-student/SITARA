import { Link } from "react-router-dom";

const FEATURES = [
  {
    title: "Personalised approval checklist",
    text: "Answer a short wizard — sector, district, size, stage — and get every licence, NOC and registration you need.",
  },
  {
    title: "Single-window applications",
    text: "Submit once, reuse verified data, and let departments work in parallel behind the scenes.",
  },
  {
    title: "Live SLA tracking",
    text: "Watch every approval timeline, get alerts before deadlines, and escalate when services stall.",
  },
  {
    title: "Renewals & compliance",
    text: "Never miss a renewal. SITARA reminds you, tracks compliance conditions and flags gaps.",
  },
  {
    title: "Inspections, scheduled",
    text: "Joint inspections planned by district and date — fewer site visits, clearer next steps.",
  },
  {
    title: "Incentives & schemes",
    text: "Auto-matched government schemes with one-click application and utilisation tracking.",
  },
];

export function HomePage() {
  return (
    <div className="home-page">
      <section className="hero">
        <p className="eyebrow">Government of India · Ease of Doing Business</p>
        <h1>
          Every approval. One portal.{" "}
          <span className="accent">Zero guesswork.</span>
        </h1>
        <p className="hero-sub">
          SITARA unifies industrial registrations, permissions, licences, NOCs,
          inspections and incentive schemes into a single intelligent dashboard —
          for applicants and departments alike.
        </p>
        <div className="hero-actions">
          <Link to="/register" className="btn btn-primary">
            Get started
          </Link>
          <Link to="/login" className="btn btn-ghost">
            Sign in
          </Link>
        </div>
      </section>
      <section className="features">
        <h2>Built for the end-to-end journey</h2>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div className="feature-card" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}