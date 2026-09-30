import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div className="home-page">
      <header className="landing-nav">
        <Link to="/" className="landing-brand"><span className="brand-mark">S</span><span><strong>SITARA</strong><small>Approvals · Compliance · Growth</small></span></Link>
        <nav aria-label="Main navigation"><a href="#home">Home</a><a href="#maharashtra">About</a><a href="#home">Features</a><a href="#maharashtra">Maharashtra</a></nav>
        <Link to="/login" className="btn btn-primary nav-login">Login</Link>
      </header>
      <main>
        <section className="hero landing-hero" id="home">
          <div className="hero-copy">
            <p className="eyebrow">Government of Maharashtra · One platform, endless possibilities</p>
            <h1>Simplifying industrial approvals &amp; compliance</h1>
            <p className="hero-sub">A simpler way to manage registrations, permissions, licences, NOCs, inspections and renewals — all in one place.</p>
            <div className="landing-perks"><span>✓ Single window access</span><span>✓ Guided applications</span><span>✓ Real time tracking</span></div>
            <div className="hero-actions"><Link to="/register" className="btn btn-primary">Get started <span aria-hidden="true">→</span></Link><a href="#features" className="btn btn-ghost">Learn more</a></div>
          </div>
          <div className="hero-image" role="img" aria-label="Industrial development in Maharashtra" />
        </section>
        <section className="trust-strip" id="maharashtra">
          <div className="trust-copy"><strong>Trusted by businesses. Enabled by Government.</strong><span>Supporting industries with a transparent and efficient approval ecosystem.</span></div>
          <div className="govt-seal"><span className="seal-mark" aria-hidden="true">♜</span><span><b>Government of India</b><small>Government of India</small></span></div>
          <div className="govt-seal"><span className="seal-mark seal-state" aria-hidden="true">✺</span><span><b>Maharashtra</b><small>Government of Maharashtra</small></span></div>
        </section>
      </main>
      <footer className="landing-footer">SITARA <span>· Government of Maharashtra</span></footer>
    </div>
  );
}
