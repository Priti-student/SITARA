import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, errorMessage } from "../context/AuthContext";

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap login-page">
      <div className="auth-card auth-card-split login-layout">
        <aside className="auth-aside">
          <Link to="/" className="auth-brand login-brand"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 17 24 6l19 11H5Zm5 3v15m9-15v15m10-15v15m9-15v15M7 39h34M4 43h40" /></svg><span><strong>NITI</strong><small>Industrial Approvals &amp; Compliance</small></span></Link>
          <div className="auth-aside-copy login-copy"><p className="eyebrow">Faster approvals. &nbsp; Stronger industry.</p><h2>Simplifying Industrial<br /><span>Approvals &amp; Compliance</span></h2><p>A unified platform to manage approvals, licences, inspections and government support — all in one place.</p>
            <div className="login-benefits">
              <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h7m-7 4h7" /></svg><span>Single<br />Window Access</span></div>
              <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3Zm-4 10 3 3 5-6" /></svg><span>Compliant<br />&amp; Transparent</span></div>
              <div><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M5 4 3 6m16-2 2 2" /></svg><span>Faster<br />Approvals</span></div>
              <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M6 16v-4h3v4m3 0V8h3v8m3 0V4h3v12" /></svg><span>Support for<br />Business Growth</span></div>
            </div>
          </div>
        </aside>
        <section className="auth-content">
        <div className="brand-block">
          <div className="login-emblem" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M7 18 24 8l17 10H7Zm4 3v14m8-14v14m10-14v14m8-14v14M7 39h34M5 43h38" /><path d="M24 4v4" /></svg></div>
          <p className="brand-tag">Sign in to continue to your account</p>
        </div>
        <h2 className="auth-title">Welcome Back</h2>
        <form onSubmit={onSubmit} className="form-grid" noValidate>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              required
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
          </label>
          {error ? <div className="alert alert-error">{error}</div> : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="auth-alt">
          New to NITI? <Link to="/register">Create an account</Link>
        </p>
        <p className="auth-hint">
          Demo super admin: <code>admin@sitara.gov.in</code> (set in server/.env)
        </p>
        </section>
      </div>
    </div>
  );
}
