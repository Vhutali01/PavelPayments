"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useCallback, useEffect } from "react";
import MockVideoPlayer, { LiveStats } from "../components/MockVideoPlayer";
import { STREAM_C as C, STREAM_CSS, streamMoney } from "../lib/streamTheme";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4001";

// No NFC tap is needed for streaming — Web Monetization pays the service wallet
// directly. This id only labels the session for the "today" stats and can be
// overridden with ?uid=… for a specific account.
const DEFAULT_STREAM_UID = process.env.NEXT_PUBLIC_DEFAULT_STREAM_UID ?? "web-viewer";

export default function StreamingDashboard() {
  const router = useRouter();
  const nfcUid = (router.query.uid as string) || DEFAULT_STREAM_UID;
  const [todayMinutes, setTodayMinutes] = useState<number | null>(null);
  const [streamedCents, setStreamedCents] = useState<number | null>(null);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/api/stream/session/${encodeURIComponent(nfcUid)}`);
      if (!res.ok) return;
      const data = await res.json();
      setTodayMinutes(data.todayMinutes ?? 0);
      setStreamedCents(data.todayStreamedCents ?? 0);
    } catch {
      // ignore
    }
  }, [nfcUid]);

  // Load today's totals on mount and keep them fresh, so "Watched today" and
  // "Streamed today" show real numbers even before a video is started.
  useEffect(() => {
    refreshSession();
    const t = setInterval(refreshSession, 10000);
    return () => clearInterval(t);
  }, [refreshSession]);

  // ── Dashboard ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <style dangerouslySetInnerHTML={{ __html: STREAM_CSS }} />
      <Header uid={nfcUid} />

      <main style={{ maxWidth: 1240, margin: "1.5rem auto", padding: "0 1.5rem", width: "100%" }}>
        {/* Stats strip — swaps to live session values while a video is playing */}
        <div style={S.statGrid} className="s-fadeUp">
          {liveStats?.isPlaying ? (
            <>
              <Stat
                label="STREAMED THIS SESSION"
                value={streamMoney(liveStats.totalCents)}
                accent
                live
              />
              <Stat
                label="TIME WATCHED"
                value={formatSeconds(liveStats.watchedSeconds)}
                tone="green"
                live
              />
              <Stat
                label="AVG RATE"
                value={`${streamMoney(liveStats.ratePerMin)}/min`}
                hint="streaming now"
                tone="green"
                live
              />
            </>
          ) : (
            <>
              <Stat label="WATCHED TODAY" value={todayMinutes !== null ? `${todayMinutes} min` : "—"} />
              <Stat
                label="STREAMED TODAY"
                value={streamedCents !== null ? streamMoney(streamedCents) : "—"}
                accent
              />
              <Stat
                label="PAID IN REAL TIME"
                value="Live"
                hint="Web Monetization streams as you watch"
                tone="green"
              />
            </>
          )}
        </div>

        {/* Video player */}
        <MockVideoPlayer
          nfcUid={nfcUid}
          onSessionChange={refreshSession}
          onLiveStats={setLiveStats}
        />
      </main>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatSeconds(s: number): string {
  const total = Math.floor(s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Header({ uid }: { uid?: string }) {
  return (
    <header style={S.header}>
      <Link href="/" style={S.back}>← Home</Link>
      <span style={{ color: C.line }}>|</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 16 }}>
        <span style={{ fontSize: 18 }}>🎬</span> Streaming
      </span>
      {uid && (
        <span style={S.uidPill}>UID&nbsp;<b style={{ color: C.text }}>{uid}</b></span>
      )}
    </header>
  );
}

function Stat({
  label, value, hint, accent, tone, live,
}: { label: string; value: string; hint?: string; accent?: boolean; tone?: "green"; live?: boolean }) {
  const valueColor = tone === "green" ? C.green : accent ? C.accent : C.text;
  const labelColor = tone === "green" ? C.green : C.accent;
  return (
    <div style={{ ...S.stat, ...(tone === "green" ? S.statGreen : null) }} className="s-card">
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ ...S.statLbl, color: labelColor }}>{label}</div>
        {live && <span className="s-live" style={{ flexShrink: 0 }} />}
      </div>
      <div style={{ ...S.statNum, color: valueColor }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: `radial-gradient(1100px 560px at 82% -12%, #1a1145 0%, ${C.bg} 56%)`,
    color: C.text,
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "0 1.5rem",
    height: 60,
    borderBottom: `1px solid ${C.line}`,
    position: "sticky",
    top: 0,
    background: "rgba(11,17,32,0.85)",
    backdropFilter: "blur(8px)",
    zIndex: 100,
  },
  back: { color: C.dim, textDecoration: "none", fontSize: 14 },
  uidPill: {
    marginLeft: "auto",
    fontSize: 12,
    color: C.dim,
    fontFamily: "ui-monospace, monospace",
    padding: "5px 12px",
    border: `1px solid ${C.line}`,
    borderRadius: 999,
    background: C.panelSoft,
  },
  panel: {
    background: C.panel,
    border: `1px solid ${C.line}`,
    borderRadius: 18,
    padding: "1.6rem",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  },
  iconTile: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: 12,
    fontSize: 22,
    background: "rgba(168,85,247,0.12)",
    border: "1px solid rgba(168,85,247,0.35)",
  },
  input: {
    padding: "0.7rem 0.9rem",
    borderRadius: 10,
    border: `1px solid ${C.line}`,
    background: C.panelSoft,
    color: C.text,
    fontSize: 14,
    outline: "none",
  },
  primary: {
    padding: "0.8rem",
    background: `linear-gradient(135deg, ${C.accent}, ${C.accentDeep})`,
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(124,58,237,0.35)",
  },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 14,
    marginBottom: 18,
  },
  stat: {
    background: C.panel,
    border: `1px solid ${C.line}`,
    borderRadius: 14,
    padding: "1.2rem 1.35rem",
    boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
  },
  statGreen: {
    background: "linear-gradient(160deg, rgba(34,197,94,0.08), #111a2e)",
    border: "1px solid rgba(34,197,94,0.3)",
  },
  statLbl: { fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em" },
  statNum: { fontSize: 27, fontWeight: 900, marginTop: 8, fontVariantNumeric: "tabular-nums" },
};
