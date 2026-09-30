import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, errorMessage } from "../context/AuthContext";

export function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await signUp({
        fullName,
        email,
        phone: phone || undefined,
        password,
      });
      navigate("/dashboard");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card auth-card-split register-card-split">
        <aside className="auth-aside">
          <Link to="/" className="landing-brand auth-brand"><span className="brand-mark">S</span><span><strong>SITARA</strong><small>Approvals · Compliance · Growth</small></span></Link>
          <div className="auth-aside-copy"><p className="eyebrow">Government of Maharashtra</p><h2>Start your business journey</h2><p>Create your account to access a simpler, more transparent industrial approval experience.</p></div>
          <div className="auth-illustration" aria-hidden="true">SITARA</div>
        </aside>
        <section className="auth-content">
        <div className="brand-block">
          <p className="brand-tag">SITARA · Government of Maharashtra</p>
        </div>
        <h2 className="auth-title">Create an account</h2>
        <form onSubmit={onSubmit} className="form-grid" noValidate>
          <label className="field">
            <span>Full name</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Priya Sharma"
              required
              minLength={2}
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.in"
              required
            />
          </label>
          <label className="field">
            <span>Phone (10 digits, optional)</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              pattern="[0-9]{10}"
            />
          </label>
          <label className="field">
            <span>Password (min 8 chars)</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
            />
          </label>
          <label className="field">
            <span>Confirm password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
            />
          </label>
          {error ? <div className="alert alert-error">{error}</div> : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="auth-alt">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
        </section>
      </div>
    </div>
  );
}
