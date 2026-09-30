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
    <div className="auth-wrap">
      <div className="auth-card auth-card-split">
        <aside className="auth-aside">
          <Link to="/" className="landing-brand auth-brand"><span className="brand-mark">S</span><span><strong>SITARA</strong><small>Approvals · Compliance · Growth</small></span></Link>
          <div className="auth-aside-copy"><p className="eyebrow">Government of Maharashtra</p><h2>Your industrial compliance partner</h2><p>Access approvals, track applications, manage renewals and explore government support schemes — all in one place.</p></div>
          <div className="auth-illustration" aria-hidden="true">SITARA</div>
        </aside>
        <section className="auth-content">
        <div className="brand-block">
          <p className="brand-tag">SITARA · Government of Maharashtra</p>
        </div>
        <h2 className="auth-title">Sign in</h2>
        <form onSubmit={onSubmit} className="form-grid" noValidate>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.in"
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
              placeholder="••••••••"
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
          New to SITARA? <Link to="/register">Create an account</Link>
        </p>
        <p className="auth-hint">
          Demo super admin: <code>admin@sitara.gov.in</code> (set in server/.env)
        </p>
        </section>
      </div>
    </div>
  );
}
