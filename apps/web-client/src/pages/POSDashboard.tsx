"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { usePOSPayment } from "../hooks/usePOSPayment";
import {
  PAY_AS_YOU_GO,
  MEMBERSHIPS,
  dailyBaseCents,
  estimate,
  isPeakNow,
  money,
  type Mode,
  type Tier,
} from "../lib/gymPricing";

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg: "#0b1120",
  panel: "#111a2e",
  panelSoft: "#0f1729",
  line: "#1f2a40",
  text: "#f1f5f9",
  dim: "#8694ad",
  green: "#22c55e",
  greenDeep: "#16a34a",
  greenSoft: "#14532d",
  amber: "#fbbf24",
};

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4001";

export default function POSDashboard() {
  const [mode, setMode] = useState<Mode>("payg");
  const [selectedKey, setSelectedKey] = useState<Tier>("day");

  // PavelFlow state
  const [flowStarting, setFlowStarting] = useState(false);
  const [flowEntryQr, setFlowEntryQr] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(45);
  const [peak, setPeak] = useState(isPeakNow());
  const [clock, setClock] = useState("");
  const [sales, setSales] = useState<{ label: string; amount: number; at: string }[]>([]);

  const { status, qrUrl, amount, label, generatePayment, mockSuccess, reset } = usePOSPayment();

  const passes = mode === "payg" ? PAY_AS_YOU_GO : MEMBERSHIPS;
  const selectedPass = passes.find((p) => p.key === selectedKey) ?? passes[0];
  const isIdle = status === "idle" || status === "failed";

  // Live charge estimate for the selected pass.
  const baseCents = dailyBaseCents(selectedPass, mode);
  const est = estimate(baseCents, minutes, peak);

  // Live clock for the front desk.
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, []);

  // After a successful payment, animate minutes upward so the customer sees the
  // estimated charge drop in real time as their session "runs".
  useEffect(() => {
    if (status !== "completed") return;
    setMinutes(0);
    const id = setInterval(() => {
      setMinutes((m) => {
        if (m >= 120) {
          clearInterval(id);
          return 120;
        }
        return m + 4;
      });
    }, 450);
    return () => clearInterval(id);
  }, [status]);

  // Record a sale once when a payment completes.
  const countedRef = useRef(false);
  useEffect(() => {
    if (status === "completed" && !countedRef.current) {
      countedRef.current = true;
      setSales((prev) => [{ label, amount, at: new Date().toISOString() }, ...prev].slice(0, 6));
    }
    if (status !== "completed") countedRef.current = false;
  }, [status, label, amount]);

  const handleMode = (m: Mode) => {
    setMode(m);
    setSelectedKey(m === "payg" ? "day" : "weekly");
  };

  const handleReset = () => {
    reset();
    setMinutes(45);
  };

  const handleFlowStart = async () => {
    setFlowStarting(true);
    setFlowError(null);
    try {
      const r = await fetch(`${BACKEND}/api/gym/flow/start`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to start session");
      setFlowEntryQr(d.entryQrUrl);
    } catch (err: unknown) {
      setFlowError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setFlowStarting(false);
    }
  };

  const handleFlowReset = () => {
    setFlowEntryQr(null);
    setFlowError(null);
  };

  const todayTotal = sales.reduce((s, x) => s + x.amount, 0);

  // Friendly copy that changes with the billing mode.
  const settledLabel = mode === "payg" ? "Charge tonight" : "Today's charge";
  const savedLabel = mode === "payg" ? "You get back" : "Saved today";

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={S.header}>
        <Link href="/" style={S.back}>← Home</Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🏋️</span>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>PavelGym</div>
            <div style={{ fontSize: 11, color: C.dim, letterSpacing: "0.06em" }}>FRONT DESK</div>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          {isPeakNow() && <span style={S.peakNow}>● Peak hours</span>}
          <span style={S.clock}>{clock}</span>
          <Link href="/GymHistory" style={S.headerLink}>History</Link>
        </div>
      </header>

      <div style={S.grid}>
        {/* ── Left — Front desk controls ──────────────────────────────────── */}
        <section style={S.panel} className="fadeUp">
          <h2 style={S.h2}>Choose a pass</h2>

          {/* Mode toggle */}
          <div style={S.toggle}>
            {([["payg", "Pay as you go"], ["member", "Membership"]] as const).map(([m, lbl]) => (
              <button
                key={m}
                className="seg"
                onClick={() => isIdle && handleMode(m)}
                disabled={!isIdle}
                style={{ ...S.segBtn, ...(mode === m ? S.segOn : null) }}
              >
                {lbl}
              </button>
            ))}
          </div>

          {/* Pass cards */}
          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            {passes.map((p) => {
              const on = selectedKey === p.key;
              return (
                <button
                  key={p.key}
                  className="passCard"
                  onClick={() => isIdle && setSelectedKey(p.key)}
                  disabled={!isIdle}
                  style={{
                    ...S.pass,
                    borderColor: on ? C.green : C.line,
                    background: on ? "linear-gradient(135deg,#13351f,#0f2418)" : C.panelSoft,
                    opacity: isIdle ? 1 : 0.55,
                    cursor: isIdle ? "pointer" : "default",
                  }}
                >
                  <span style={{ fontSize: 22 }}>{p.icon}</span>
                  <span style={{ textAlign: "left", flex: 1 }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 15 }}>{p.label}</span>
                    <span style={{ fontSize: 12, color: C.dim }}>{p.note}</span>
                  </span>
                  <span style={{ fontWeight: 800, fontSize: 16, color: on ? C.green : C.text }}>
                    {p.streaming ? <span style={{ fontSize: 13, color: on ? C.green : C.dim }}>Live</span> : money(p.upfrontCents)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Upfront total + action */}
          <div style={S.totalRow}>
            {selectedPass.streaming ? (
              <>
                <span>
                  <span style={{ display: "block", color: C.dim, fontSize: 13 }}>PavelFlow · $0.50/min</span>
                  <span style={{ fontSize: 11, color: C.dim }}>No fixed amount — accumulates until tap-out</span>
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>Live 💳</span>
              </>
            ) : (
              <>
                <span>
                  <span style={{ display: "block", color: C.dim, fontSize: 13 }}>Pay now (upfront)</span>
                  <span style={{ fontSize: 11, color: C.dim }}>
                    {mode === "payg" ? "No subscription — pay per visit" : "Starts your membership"}
                  </span>
                </span>
                <span style={{ fontSize: 26, fontWeight: 900, color: C.green }}>
                  {money(selectedPass.upfrontCents)}
                </span>
              </>
            )}
          </div>

          {isIdle ? (
            selectedPass.streaming ? (
              /* ── PavelFlow — generate QR immediately, wallet entered on phone ── */
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {flowError && <p style={{ color: "#fca5a5", margin: 0, fontSize: 12 }}>{flowError}</p>}
                <button
                  className="btn"
                  onClick={handleFlowStart}
                  disabled={flowStarting}
                  style={S.primary}
                >
                  {flowStarting ? "Starting…" : "Start PavelFlow Session"}
                </button>
              </div>
            ) : (
              <button className="btn" onClick={() => generatePayment(selectedKey)} style={S.primary}>
                Charge customer
              </button>
            )
          ) : (
            <button className="btn" onClick={handleReset} style={S.secondary}>
              ↺ New sale
            </button>
          )}

          {status === "pending" && (
            <button
              onClick={mockSuccess}
              className="devmock"
              style={S.devmock}
              title="Simulate a successful payment"
            >
              simulate payment
            </button>
          )}
        </section>

        {/* ── Middle — Customer screen ────────────────────────────────────── */}
        <section style={{ ...S.panel, ...S.customer }} className="fadeUp">
          {status === "idle" && (
            <div className="center">
              <div className="floaty" style={{ fontSize: 56 }}>🛎️</div>
              <h3 style={S.bigTitle}>Ready when you are</h3>
              <p style={{ color: C.dim, margin: 0 }}>Pick a pass on the left to start a sale.</p>
            </div>
          )}

          {status === "generating" && (
            <div className="center">
              <div className="spinner" />
              <p style={{ color: C.dim, marginTop: 18 }}>Setting up the payment…</p>
            </div>
          )}

          {status === "pending" && qrUrl && (
            <div className="center fadeUp">
              <p style={{ margin: "0 0 14px", color: C.dim, fontSize: 14 }}>
                {label}{selectedPass.streaming ? " · " : " · "}<strong style={{ color: C.text }}>{selectedPass.streaming ? "PavelFlow · $0.50/min" : `${money(amount)} now`}</strong>
              </p>
              <div className="qrGlow" style={S.qrWrap}>
                <QRCodeSVG value={qrUrl} size={210} level="H" bgColor="#ffffff" fgColor="#0b1120" />
              </div>
              <h3 style={{ ...S.bigTitle, marginTop: 20 }}>Scan to pay</h3>
              <p style={{ color: C.dim, margin: "4px 0 14px" }}>
                Point your phone camera at the code, then confirm in your wallet.
              </p>
              <span style={S.waiting}>
                <span className="dot" /> Waiting for payment
              </span>
            </div>
          )}

          {status === "completed" && (
            <div className="center pop" style={{ width: "100%" }}>
              <div style={{ fontSize: 52 }}>✅</div>
              <h3 style={{ ...S.bigTitle, color: C.green, marginTop: 4 }}>You&apos;re in!</h3>
              <p style={{ color: C.dim, margin: "2px 0 12px" }}>
                {label} · paid {money(amount)}
              </p>
              <div style={S.unlock}>🔓 Turnstile open</div>

              {/* Live session estimate */}
              <div style={S.liveCard} className="fadeUp">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: C.dim }}>
                    Time trained <strong style={{ color: C.text }}>{minutes} min</strong>
                  </span>
                  {peak && <span style={S.peakPill}>peak rate</span>}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 13, color: C.dim }}>{settledLabel}</span>
                  <span className="num" style={{ fontSize: 26, fontWeight: 900, color: C.green }}>
                    {money(est.finalCents)}
                  </span>
                  {est.savedCents > 0 && (
                    <span style={{ fontSize: 13, color: C.amber, fontWeight: 700 }}>
                      {savedLabel} {money(est.savedCents)}
                    </span>
                  )}
                </div>
                <DiscountBar fraction={est.discountFraction} max={est.maxFraction} />
                <p style={{ margin: "8px 0 0", fontSize: 11.5, color: C.dim }}>
                  The longer you train, the less you pay — settled tonight.
                </p>
              </div>
            </div>
          )}

          {status === "failed" && (
            <div className="center">
              <div style={{ fontSize: 52 }}>⚠️</div>
              <h3 style={{ ...S.bigTitle, color: C.amber }}>That didn&apos;t go through</h3>
              <p style={{ color: C.dim, margin: "4px 0 0" }}>
                No charge was made. Tap “New sale” and try again.
              </p>
            </div>
          )}
        </section>

        {/* ── Right — Live pricing + Today ────────────────────────────────── */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Dynamic pricing estimator */}
          <section style={S.panel} className="fadeUp">
            {selectedPass.streaming ? (
              <>
                <h2 style={S.h2}>PavelFlow</h2>
                <p style={{ margin: "-6px 0 14px", fontSize: 12.5, color: C.dim }}>
                  Charges accrue in real time from the customer&apos;s wallet while they train. No upfront charge — the balance settles when they scan the exit QR to leave.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0.75rem", background: C.greenSoft, borderRadius: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 22 }}>💳</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.green }}>Session active — accumulating</div>
                    <div style={{ fontSize: 12, color: C.dim }}>$0.50/min · max $60.00/day · settles on exit</div>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6 }}>
                  <div>● No set amount required at the till</div>
                  <div>● Charge accumulates per minute in real time</div>
                  <div>● Full balance settled automatically on exit</div>
                </div>
              </>
            ) : (
              <>
                <h2 style={S.h2}>Their charge today</h2>
                <p style={{ margin: "-6px 0 14px", fontSize: 12.5, color: C.dim }}>
                  {mode === "payg"
                    ? "The longer they stay, the more they save — drag to preview."
                    : "Members pay less the more sessions they fit in — drag to preview."}
                </p>

                <div style={S.estTop}>
                  <div>
                    <div style={{ fontSize: 12, color: C.dim }}>{settledLabel}</div>
                    <div className="num" style={{ fontSize: 30, fontWeight: 900, color: C.green }}>
                      {money(est.finalCents)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: C.dim }}>full price</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.dim, textDecoration: "line-through" }}>
                      {money(est.baseCents)}
                    </div>
                  </div>
                </div>
                {est.savedCents > 0 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, padding: "8px 12px", background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 8 }}>
                    <span style={{ fontSize: 12.5, color: C.amber, fontWeight: 700 }}>They save today</span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: C.amber }}>{money(est.savedCents)}</span>
                  </div>
                )}

                <DiscountBar fraction={est.discountFraction} max={est.maxFraction} />

                {/* Minutes slider */}
                <label style={S.sliderLabel}>
                  <span>How long will they stay?</span>
                  <span style={{ color: C.text, fontWeight: 700 }}>{minutes} min</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={120}
                  step={5}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className="range"
                />

                {/* Peak toggle */}
                <button
                  className="seg"
                  onClick={() => setPeak((p) => !p)}
                  style={{
                    ...S.peakToggle,
                    borderColor: peak ? C.amber : C.line,
                    color: peak ? C.amber : C.dim,
                    background: peak ? "rgba(251,191,36,0.08)" : "transparent",
                  }}
                >
                  {peak ? "● Peak hours active — discount reduced" : "○ Off-peak — maximum discount applies"}
                </button>
              </>
            )}
          </section>

          {/* Today */}
          <section style={S.panel} className="fadeUp">
            <h2 style={S.h2}>Today</h2>
            <div style={S.statsRow}>
              <div style={S.stat}>
                <div style={S.statNum}>{sales.length}</div>
                <div style={S.statLbl}>Sales</div>
              </div>
              <div style={S.stat}>
                <div style={S.statNum}>{money(todayTotal)}</div>
                <div style={S.statLbl}>Collected</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {sales.length === 0 ? (
                <p style={{ color: C.dim, fontSize: 13, margin: "2px 0" }}>No sales yet today.</p>
              ) : (
                sales.map((s, i) => (
                  <div key={i} className="fadeUp" style={S.saleRow}>
                    <span style={{ width: 8, height: 8, borderRadius: 8, background: C.green, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 14 }}>{s.label}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.green }}>{money(s.amount)}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>

      {/* ── PavelFlow Entry QR Modal ──────────────────────────────────────── */}
      {flowEntryQr && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "1rem" }}
          onClick={handleFlowReset}>
          <div style={{ background: "#111a2e", border: `1px solid ${C.line}`, borderRadius: 16, padding: "1.5rem", width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>Entry QR — PavelFlow</div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>Customer scans to confirm entry and start their session</div>
              </div>
              <button onClick={handleFlowReset} style={{ background: "none", border: "none", color: C.dim, fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 4 }}>✕</button>
            </div>
            <div style={{ background: C.greenSoft, border: `1px solid ${C.green}`, borderRadius: 8, padding: "0.65rem 1rem", marginBottom: 14, fontSize: 13, color: C.green }}>
              💳 PavelFlow — $0.50/min · max $60.00/day
            </div>
            <div style={{ display: "flex", justifyContent: "center", padding: "1.25rem", background: "#fff", borderRadius: 10 }}>
              <QRCodeSVG value={flowEntryQr} size={210} level="H" bgColor="#ffffff" fgColor="#0b1120" />
            </div>
            <p style={{ fontSize: 12, color: C.dim, textAlign: "center", marginTop: 12 }}>
              Customer scans → confirms entry → charges start accumulating
            </p>
            <button onClick={handleFlowReset} style={{ width: "100%", marginTop: 12, padding: "0.6rem", background: C.panelSoft, border: `1px solid ${C.line}`, borderRadius: 8, color: C.dim, fontSize: 13, cursor: "pointer" }}>
              ↺ New session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Discount progress bar ────────────────────────────────────────────────────
function DiscountBar({ fraction, max }: { fraction: number; max: number }) {
  const pct = Math.round(fraction * 100);
  const capPct = Math.round(max * 100);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={S.barTrack}>
        <div style={{ ...S.barFill, width: `${(fraction / 0.5) * 100}%` }} className="bar" />
        {/* cap marker */}
        <div style={{ ...S.barCap, left: `${(max / 0.5) * 100}%` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
        <span style={{ fontSize: 11, color: C.dim }}>{pct}% off</span>
        <span style={{ fontSize: 11, color: C.dim }}>max {capPct}%</span>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: "100vh",
    background: `radial-gradient(1200px 600px at 80% -10%, #15233f 0%, ${C.bg} 55%)`,
    color: C.text,
    fontFamily: "'Inter', system-ui, sans-serif",
  } as React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "0 1.5rem",
    height: 60,
    borderBottom: `1px solid ${C.line}`,
    position: "sticky",
    top: 0,
    background: "rgba(11,17,32,0.85)",
    backdropFilter: "blur(8px)",
    zIndex: 100,
  } as React.CSSProperties,
  back: { color: C.dim, textDecoration: "none", fontSize: 14 } as React.CSSProperties,
  headerLink: {
    color: C.dim,
    textDecoration: "none",
    fontSize: 13,
    padding: "5px 12px",
    border: `1px solid ${C.line}`,
    borderRadius: 8,
  } as React.CSSProperties,
  clock: { fontSize: 13, color: C.dim, fontVariantNumeric: "tabular-nums" } as React.CSSProperties,
  peakNow: {
    fontSize: 12,
    fontWeight: 700,
    color: C.amber,
    background: "rgba(251,191,36,0.1)",
    border: "1px solid rgba(251,191,36,0.4)",
    borderRadius: 999,
    padding: "3px 10px",
  } as React.CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(300px,1fr) minmax(340px,1.15fr) minmax(280px,0.95fr)",
    gap: 18,
    maxWidth: 1340,
    margin: "1.5rem auto",
    padding: "0 1.5rem",
    alignItems: "start",
  } as React.CSSProperties,
  panel: {
    background: C.panel,
    border: `1px solid ${C.line}`,
    borderRadius: 18,
    padding: "1.4rem",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  } as React.CSSProperties,
  h2: {
    margin: "0 0 14px",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: C.dim,
    textTransform: "uppercase",
  } as React.CSSProperties,
  toggle: {
    display: "flex",
    gap: 6,
    background: C.panelSoft,
    padding: 5,
    borderRadius: 12,
    border: `1px solid ${C.line}`,
  } as React.CSSProperties,
  segBtn: {
    flex: 1,
    padding: "9px 10px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: C.dim,
    fontWeight: 600,
    fontSize: 13.5,
    cursor: "pointer",
    transition: "all .15s",
  } as React.CSSProperties,
  segOn: { background: C.greenDeep, color: "#fff", boxShadow: "0 2px 10px rgba(22,163,74,0.4)" } as React.CSSProperties,
  pass: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid",
    color: C.text,
    transition: "all .15s",
  } as React.CSSProperties,
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    margin: "18px 0 14px",
    padding: "12px 16px",
    background: C.panelSoft,
    border: `1px solid ${C.line}`,
    borderRadius: 12,
  } as React.CSSProperties,
  primary: {
    width: "100%",
    padding: "14px",
    background: `linear-gradient(135deg, ${C.green}, ${C.greenDeep})`,
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontWeight: 800,
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(22,163,74,0.35)",
    transition: "all .15s",
  } as React.CSSProperties,
  secondary: {
    width: "100%",
    padding: "14px",
    background: "transparent",
    color: C.dim,
    border: `1px solid ${C.line}`,
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
    transition: "all .15s",
  } as React.CSSProperties,
  devmock: {
    display: "block",
    width: "100%",
    marginTop: 10,
    padding: "6px",
    background: "transparent",
    color: "rgba(255,255,255,0.18)",
    border: "1px dashed rgba(255,255,255,0.12)",
    borderRadius: 8,
    fontSize: 11,
    cursor: "pointer",
  } as React.CSSProperties,
  customer: {
    minHeight: 480,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    background: "linear-gradient(160deg,#101b31,#0c1424)",
  } as React.CSSProperties,
  bigTitle: { margin: "12px 0 0", fontSize: 23, fontWeight: 800 } as React.CSSProperties,
  qrWrap: { display: "inline-block", padding: 13, background: "#fff", borderRadius: 16 } as React.CSSProperties,
  waiting: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 16px",
    background: "rgba(217,119,6,0.12)",
    border: "1px solid rgba(217,119,6,0.5)",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    color: C.amber,
  } as React.CSSProperties,
  unlock: {
    padding: "8px 18px",
    background: C.greenSoft,
    border: `1px solid ${C.greenDeep}`,
    borderRadius: 999,
    fontWeight: 800,
    color: C.green,
    fontSize: 14,
  } as React.CSSProperties,
  liveCard: {
    width: "100%",
    marginTop: 18,
    padding: "14px 16px",
    background: C.panelSoft,
    border: `1px solid ${C.line}`,
    borderRadius: 14,
    textAlign: "left",
  } as React.CSSProperties,
  peakPill: {
    fontSize: 11,
    fontWeight: 700,
    color: C.amber,
    background: "rgba(251,191,36,0.1)",
    border: "1px solid rgba(251,191,36,0.4)",
    borderRadius: 999,
    padding: "2px 8px",
  } as React.CSSProperties,
  estTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    padding: "12px 14px",
    background: C.panelSoft,
    border: `1px solid ${C.line}`,
    borderRadius: 12,
  } as React.CSSProperties,
  sliderLabel: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12.5,
    color: C.dim,
    margin: "16px 0 6px",
  } as React.CSSProperties,
  peakToggle: {
    width: "100%",
    marginTop: 14,
    padding: "10px",
    borderRadius: 10,
    border: "1px solid",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    transition: "all .15s",
  } as React.CSSProperties,
  statsRow: { display: "flex", gap: 10 } as React.CSSProperties,
  stat: {
    flex: 1,
    background: C.panelSoft,
    border: `1px solid ${C.line}`,
    borderRadius: 12,
    padding: "14px",
  } as React.CSSProperties,
  statNum: { fontSize: 22, fontWeight: 900, color: C.text } as React.CSSProperties,
  statLbl: { fontSize: 12, color: C.dim, marginTop: 2 } as React.CSSProperties,
  saleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 11px",
    background: C.panelSoft,
    border: `1px solid ${C.line}`,
    borderRadius: 10,
  } as React.CSSProperties,
  barTrack: {
    position: "relative",
    height: 8,
    background: C.panelSoft,
    border: `1px solid ${C.line}`,
    borderRadius: 999,
    overflow: "hidden",
  } as React.CSSProperties,
  barFill: {
    height: "100%",
    background: `linear-gradient(90deg, ${C.greenDeep}, ${C.green})`,
    borderRadius: 999,
  } as React.CSSProperties,
  barCap: {
    position: "absolute",
    top: -2,
    width: 2,
    height: 12,
    background: C.amber,
    opacity: 0.7,
  } as React.CSSProperties,
};

// ── Animations & hover ───────────────────────────────────────────────────────
const CSS = `
.center{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1rem}
.btn:hover{transform:translateY(-1px);filter:brightness(1.07)}
.btn:active{transform:translateY(0)}
.passCard:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.08)}
.seg:hover:not(:disabled){color:#cdd6e6}
.devmock:hover{color:rgba(255,255,255,0.4)}
.num{transition:color .2s;font-variant-numeric:tabular-nums}
.bar{transition:width .35s cubic-bezier(.4,0,.2,1)}
.fadeUp{animation:fadeUp .35s ease both}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.pop{animation:pop .4s cubic-bezier(.34,1.56,.64,1) both}
@keyframes pop{0%{opacity:0;transform:scale(.85)}100%{opacity:1;transform:scale(1)}}
.floaty{animation:floaty 3s ease-in-out infinite}
@keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.qrGlow{box-shadow:0 0 0 4px rgba(34,197,94,.5),0 0 30px rgba(34,197,94,.25);animation:glow 2s ease-in-out infinite}
@keyframes glow{0%,100%{box-shadow:0 0 0 4px rgba(34,197,94,.5),0 0 26px rgba(34,197,94,.2)}50%{box-shadow:0 0 0 4px rgba(34,197,94,.8),0 0 40px rgba(34,197,94,.4)}}
.dot{width:8px;height:8px;border-radius:50%;background:#fbbf24;animation:blink 1.1s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}
.spinner{width:46px;height:46px;border-radius:50%;border:4px solid rgba(255,255,255,.12);border-top-color:#22c55e;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.range{width:100%;-webkit-appearance:none;appearance:none;height:6px;border-radius:999px;background:#1f2a40;outline:none}
.range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:#22c55e;cursor:pointer;border:3px solid #0b1120;box-shadow:0 0 0 1px #16a34a}
.range::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#22c55e;cursor:pointer;border:3px solid #0b1120}
`;
