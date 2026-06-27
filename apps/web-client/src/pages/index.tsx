import Link from "next/link";

const C = {
  bg: "#0b1120",
  panel: "#111a2e",
  panelSoft: "#0f1729",
  line: "#1f2a40",
  text: "#f1f5f9",
  dim: "#8694ad",
};

const SECTIONS = [
  {
    href: "/Dashboard",
    label: "Wallet",
    icon: "💳",
    description: "Connect your Open Payments wallet and authorise spending mandates.",
    accent: "#60a5fa",
    accentSoft: "rgba(96,165,250,0.1)",
    accentLine: "rgba(96,165,250,0.25)",
  },
  {
    href: "/POSDashboard",
    label: "Gym",
    icon: "🏋️",
    description: "Front desk checkout — sell a pass and let members pay by scanning a code.",
    accent: "#22c55e",
    accentSoft: "rgba(34,197,94,0.1)",
    accentLine: "rgba(34,197,94,0.25)",
  },
  {
    href: "/StreamingDashboard",
    label: "Streaming",
    icon: "🎬",
    description: "Stream content and pay per minute, settled automatically at midnight.",
    accent: "#a78bfa",
    accentSoft: "rgba(167,139,250,0.1)",
    accentLine: "rgba(167,139,250,0.25)",
  },
];

const CSS = `
  body { margin: 0; }
  .nav-card { transition: transform .15s, box-shadow .15s; }
  .nav-card:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.4) !important; }
`;

export default function HomePage() {
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(1200px 600px at 60% -5%, #15233f 0%, ${C.bg} 55%)`, color: C.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{CSS}</style>

      <header style={{ display: "flex", alignItems: "center", padding: "0 1.5rem", height: 60, borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, background: "rgba(11,17,32,0.85)", backdropFilter: "blur(8px)", zIndex: 100 }}>
        <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.3px" }}>PavelPayments</span>
      </header>

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "3.5rem 1.5rem" }}>
        {/* Hero */}
        <div style={{ marginBottom: "2.5rem" }}>
          <h1 style={{ margin: "0 0 0.6rem", fontSize: 34, fontWeight: 800, color: C.text, letterSpacing: "-0.5px" }}>
            Interledger-Powered Payments
          </h1>
          <p style={{ margin: 0, color: C.dim, fontSize: 15.5, maxWidth: 480, lineHeight: 1.6 }}>
            Dynamic billing for gym sessions, static subscriptions, and pay-per-minute content —
            all settled via Open Payments at midnight.
          </p>
        </div>

        {/* Section cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {SECTIONS.map(({ href, label, icon, description, accent, accentSoft, accentLine }) => (
            <Link
              key={href}
              href={href}
              className="nav-card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1.25rem",
                padding: "1.25rem 1.5rem",
                background: C.panel,
                border: `1px solid ${C.line}`,
                borderRadius: 14,
                textDecoration: "none",
                color: C.text,
                boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              }}
            >
              <span style={{ fontSize: 30, width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center", background: accentSoft, border: `1px solid ${accentLine}`, borderRadius: 12, flexShrink: 0 }}>
                {icon}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: accent }}>{label}</div>
                <div style={{ fontSize: 13.5, color: C.dim, marginTop: 3 }}>{description}</div>
              </div>
              <span style={{ color: C.dim, fontSize: 18, flexShrink: 0 }}>→</span>
            </Link>
          ))}
        </div>

        <p style={{ marginTop: "2.5rem", color: "#475569", fontSize: 12.5, textAlign: "center", letterSpacing: "0.03em" }}>
          Powered by Interledger · Open Payments · GNAP
        </p>
      </main>
    </div>
  );
}
