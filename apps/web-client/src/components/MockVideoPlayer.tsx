"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { STREAM_C as C, STREAM_CSS, streamMoney as money } from "../lib/streamTheme";
import { useWebMonetization, WMState } from "../hooks/useWebMonetization";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4001";
// Receiver wallet address that gets paid as the user streams.
const WM_RECEIVER = process.env.NEXT_PUBLIC_WALLET_ADDRESS ?? "";
// Demo fallback streaming rate (cents per minute) used when no real Web
// Monetization agent is paying. Override with NEXT_PUBLIC_STREAM_RATE_CENTS_PER_MIN.
const DEMO_RATE_CENTS_PER_MIN = Number(process.env.NEXT_PUBLIC_STREAM_RATE_CENTS_PER_MIN ?? 12);

// Responsive two-column layout: player on the left, scrollable library on the
// right. Collapses to a single column on narrow viewports so the page resizes
// gracefully. A custom scrollbar keeps the library card on-brand.
const STREAM_LAYOUT_CSS = `
.s-stream-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 18px;
  align-items: start;
}
@media (max-width: 760px) {
  .s-stream-grid { grid-template-columns: 1fr; }
  .s-stream-grid aside { position: static !important; max-height: none !important; }
}
.s-scroll { scrollbar-width: thin; scrollbar-color: rgba(168,85,247,0.45) transparent; }
.s-scroll::-webkit-scrollbar { width: 8px; }
.s-scroll::-webkit-scrollbar-track { background: transparent; }
.s-scroll::-webkit-scrollbar-thumb {
  background: rgba(168,85,247,0.35);
  border-radius: 999px;
}
.s-scroll::-webkit-scrollbar-thumb:hover { background: rgba(168,85,247,0.6); }
`;

interface MockContent {
  id: string;
  title: string;
  type: "movie" | "show" | "live";
  duration: string;
  poster: string;
  /** Path to the real video file under web-client/public/. */
  src: string;
}

const MOCK_CATALOG: MockContent[] = [
  { id: "from-s04e01", title: "From · S4E1", type: "show", duration: "54m", poster: "📺", src: "/videos/from-s04e01.mp4" },
  { id: "from-s04e02", title: "From · S4E2 — Fray", type: "show", duration: "54m", poster: "📺", src: "/videos/from-s04e02.mp4" },
  { id: "from-s04e03", title: "From · S4E3", type: "show", duration: "48m", poster: "📺", src: "/videos/from-s04e03.mp4" },
  { id: "from-s04e04", title: "From · S4E4", type: "show", duration: "52m", poster: "📺", src: "/videos/from-s04e04.mp4" },
  { id: "from-s04e05", title: "From · S4E5 — What a Long Strange Trip It's Been", type: "show", duration: "53m", poster: "📺", src: "/videos/from-s04e05.mp4" },
  { id: "from-s04e06", title: "From · S4E6", type: "show", duration: "52m", poster: "📺", src: "/videos/from-s04e06.mp4" },
  { id: "from-s04e07", title: "From · S4E7", type: "show", duration: "51m", poster: "📺", src: "/videos/from-s04e07.mp4" },
  { id: "from-s04e08", title: "From · S4E8", type: "show", duration: "58m", poster: "📺", src: "/videos/from-s04e08.mp4" },
  { id: "from-s04e09", title: "From · S4E9", type: "show", duration: "47m", poster: "📺", src: "/videos/from-s04e09.mp4" },
];

const CATALOG_GROUPS: { label: string; type: MockContent["type"] }[] = [
  { label: "Movies", type: "movie" },
  { label: "Series", type: "show" },
  { label: "Live", type: "live" },
];

function typeLabel(type: MockContent["type"]): string {
  return type === "movie" ? "Movie" : type === "show" ? "Series" : "Live";
}

export interface LiveStats {
  isPlaying: boolean;
  totalCents: number;
  watchedSeconds: number;
  ratePerMin: number;
}

interface MockVideoPlayerProps {
  nfcUid: string;
  onSessionChange?: () => void;
  onLiveStats?: (stats: LiveStats) => void;
}

export default function MockVideoPlayer({ nfcUid, onSessionChange, onLiveStats }: MockVideoPlayerProps) {
  const [selected, setSelected] = useState<MockContent | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [watchedSeconds, setWatchedSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Furthest playback position reached — basis for the "watched" progress.
  const maxWatchedRef = useRef(0);
  // Latest session id, readable from the Web Monetization payment callback.
  const sessionIdRef = useRef<string | null>(null);
  // Heartbeat timer that reports watched time to the backend while playing.
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop the heartbeat if the player unmounts mid-playback.
  useEffect(
    () => () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    },
    []
  );

  const isLive = selected?.type === "live";
  const fraction = durationSeconds > 0 ? Math.min(watchedSeconds / durationSeconds, 1) : 0;
  const pct = Math.round(fraction * 100);

  // ── Web Monetization: stream micropayments to the service while watching ──────
  const handleWmPayment = useCallback(
    (cents: number, assetCode: string) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      fetch(`${BACKEND}/api/stream/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, amountCents: cents, assetCode }),
      })
        .then(() => onSessionChange?.())
        .catch(() => {});
    },
    [onSessionChange]
  );

  const wm = useWebMonetization({
    receiver: WM_RECEIVER,
    onPayment: handleWmPayment,
    fallbackCentsPerMinute: DEMO_RATE_CENTS_PER_MIN,
  });
  const wmRatePerMin = watchedSeconds > 0 ? (wm.totalCents / watchedSeconds) * 60 : 0;

  // Bubble live session stats up so the dashboard can swap its strip.
  useEffect(() => {
    onLiveStats?.({ isPlaying, totalCents: wm.totalCents, watchedSeconds, ratePerMin: wmRatePerMin });
  }, [isPlaying, wm.totalCents, watchedSeconds, wmRatePerMin, onLiveStats]);

  const startSession = useCallback(
    async (content: MockContent, duration: number) => {
      try {
        const res = await fetch(`${BACKEND}/api/stream/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: nfcUid,
            contentId: content.id,
            contentTitle: content.title,
            contentType: content.type,
            durationSeconds: Math.round(duration),
          }),
        });
        if (!res.ok) {
          const { error } = await res.json();
          throw new Error(error);
        }
        const { session } = await res.json();
        setSessionId(session.id);
        sessionIdRef.current = session.id;
        setMessage(`Now streaming: ${content.title} — paying as you watch via Web Monetization`);
        onSessionChange?.();
      } catch (err: unknown) {
        setMessage(err instanceof Error ? err.message : "Failed to start stream");
      }
    },
    [nfcUid, onSessionChange]
  );

  function handleSelect(content: MockContent) {
    if (selected?.id === content.id) return;
    setSelected(content);
    setSessionId(null);
    sessionIdRef.current = null;
    setWatchedSeconds(0);
    setDurationSeconds(0);
    maxWatchedRef.current = 0;
    wm.reset();
    setMessage("Loading…");
    // The <video> is remounted (key={selected.id}) with autoPlay, so playback
    // starts on its own once the new source is ready — see handleCanPlay.
  }

  // Fallback play trigger: if the browser blocked autoPlay, retry once the
  // media is ready. This still runs inside the user's click activation window.
  function handleCanPlay() {
    if (videoRef.current && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    }
  }

  async function handleStop() {
    if (!sessionId) return;
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    const finalWatched = Math.round(maxWatchedRef.current);
    const finalDuration = Math.round(durationSeconds);
    setMessage("Stopping…");
    videoRef.current?.pause();
    wm.stop();
    try {
      const res = await fetch(`${BACKEND}/api/stream/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          secondsWatched: finalWatched,
          durationSeconds: finalDuration,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error);
      }
      await res.json();
      setIsPlaying(false);
      setSessionId(null);
      sessionIdRef.current = null;
      setMessage(`Stopped. ${money(wm.totalCents)} streamed to the service this session.`);
      onSessionChange?.();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to stop stream");
    }
  }

  function handleLoadedMetadata() {
    const v = videoRef.current;
    if (!v) return;
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    setDurationSeconds(dur);
    if (selected && !sessionId) {
      startSession(selected, dur);
    }
  }

  function handlePlay() {
    setIsPlaying(true);
    wm.start();
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(reportProgress, 15000);
  }

  function handlePause() {
    setIsPlaying(false);
    wm.stop();
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    reportProgress();
  }

  // Report watched time on the open session without closing it, so the
  // dashboard's "Watched today" climbs live while the video plays.
  function reportProgress() {
    const sid = sessionIdRef.current;
    const v = videoRef.current;
    if (!sid || !v) return;
    fetch(`${BACKEND}/api/stream/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sid,
        secondsWatched: Math.round(maxWatchedRef.current),
        durationSeconds: Math.round(v.duration || durationSeconds),
      }),
    })
      .then(() => onSessionChange?.())
      .catch(() => {});
  }

  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    maxWatchedRef.current = Math.max(maxWatchedRef.current, v.currentTime);
    setWatchedSeconds(maxWatchedRef.current);
  }

  function formatTime(s: number) {
    const total = Math.floor(s);
    const m = Math.floor(total / 60);
    const sec = total % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div style={S.layout} className="s-stream-grid s-fadeUp">
      <style dangerouslySetInnerHTML={{ __html: STREAM_CSS + STREAM_LAYOUT_CSS }} />

      {/* ── Left: player card ─────────────────────────────────────────────── */}
      <div style={S.panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={S.iconTile}>📺</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: "0.01em" }}>Mock Streaming Service</h2>
            <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>Paid in real time with Web Monetization</div>
          </div>
          <WmStatusPill state={wm.state} />
        </div>

        {/* Web Monetization availability notice */}
        {(wm.state === "unsupported" || wm.state === "unconfigured") && (
          <div style={S.wmNotice}>
            {wm.state === "unsupported"
              ? "No Web Monetization agent detected. Install a Web Monetization–enabled browser or extension and add a funded wallet to stream payments while you watch."
              : "Streaming wallet not configured. Set NEXT_PUBLIC_WALLET_ADDRESS to the service wallet address to receive Web Monetization payments."}
          </div>
        )}

        {/* Now playing / hero */}
        {selected ? (
        <div style={S.stage} className="s-pop">
          {/* Video frame */}
          <div style={S.videoFrame}>
            <video
              key={selected.id}
              ref={videoRef}
              src={selected.src}
              autoPlay
              controls
              playsInline
              onCanPlay={handleCanPlay}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPlay={handlePlay}
              onPause={handlePause}
              onEnded={handleStop}
              style={S.video}
            />
            {wm.state === "active" && (
              <div style={S.livePill}>
                <span className="s-live" /> STREAMING
              </div>
            )}
            <div style={S.priceChip}>
              {money(wm.totalCents)}{wm.state === "active" ? " · live" : ""}
            </div>
          </div>

          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
            <span style={S.posterTile}>{selected.poster}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selected.title}
                </span>
                <span style={S.badge}>{typeLabel(selected.type)}</span>
              </div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                {isLive ? "Live broadcast" : `${formatTime(watchedSeconds)} / ${formatTime(durationSeconds)}`}
              </div>
            </div>
            {sessionId && (
              <button onClick={handleStop} style={S.stopBtn} className="s-btn">
                ⏹ Stop
              </button>
            )}
          </div>

          {/* Watched progress */}
          {!isLive && (
            <>
              <div style={S.progressLabel}>
                <span>Watched <b style={{ color: C.text }}>{pct}%</b></span>
                <span>{formatTime(watchedSeconds)} / {formatTime(durationSeconds)}</span>
              </div>
              <div style={S.barTrack}>
                <div style={{ ...S.barFill, width: `${pct}%` }} className="s-bar" />
              </div>
            </>
          )}

          {/* Streaming breakdown */}
          <div style={S.cellGrid}>
            <BillingCell
              label="Streamed this session"
              value={money(wm.totalCents)}
              color={C.accent}
              live={wm.state === "active"}
            />
            <BillingCell label="Time watched" value={formatTime(watchedSeconds)} color={C.text} />
            <BillingCell
              label="Avg rate"
              value={`${money(wmRatePerMin)}/min`}
              color={C.green}
              caption={wm.state === "active" ? "streaming now" : undefined}
            />
          </div>

          <p style={S.fineprint}>
            Your Web Monetization agent streams payments straight to the service wallet as you watch — stop any time and the stream stops with you.
          </p>
        </div>
      ) : (
        <div style={S.hero} className="s-pop">
          <div style={S.heroInner}>
            <div style={S.heroIcon}>▶</div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Choose something to watch</div>
            <div style={{ fontSize: 13, color: C.dim, marginTop: 6 }}>
              Press play and your browser streams micropayments to the service in real time, for exactly as long as you watch.
            </div>
          </div>
        </div>
      )}

      {message && <p style={S.message}>{message}</p>}
      </div>

      {/* ── Right: scrollable library card ────────────────────────────────── */}
      <aside style={S.sidePanel}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={S.iconTileSm}>🎞️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>Library</h3>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{MOCK_CATALOG.length} titles · pick one to play</div>
          </div>
        </div>

        <div style={S.catalogScroll} className="s-scroll">
          {/* Catalog */}
          {CATALOG_GROUPS.map((group) => {
            const items = MOCK_CATALOG.filter((c) => c.type === group.type);
            if (!items.length) return null;
            return (
              <div key={group.label} style={{ marginBottom: 18 }}>
                <div style={S.groupLabel}>{group.label}</div>
                <div style={S.catalog}>
                  {items.map((content) => {
                    const isActive = selected?.id === content.id;
                    const disabled = isPlaying && !isActive;
                    const activate = () =>
                      isActive && sessionId ? handleStop() : handleSelect(content);
                    return (
                      <div
                        key={content.id}
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        aria-disabled={disabled}
                        onClick={() => !disabled && activate()}
                        onKeyDown={(e) => {
                          if (disabled) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            activate();
                          }
                        }}
                        style={{
                          ...S.contentCard,
                          borderColor: isActive ? "rgba(168,85,247,0.5)" : C.line,
                          background: isActive ? "rgba(168,85,247,0.08)" : C.panelSoft,
                          opacity: disabled ? 0.5 : 1,
                          cursor: disabled ? "not-allowed" : "pointer",
                        }}
                        className="s-card"
                      >
                        <span style={S.posterTileSm}>{content.poster}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {content.title}
                          </div>
                          <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>
                            {content.duration} · <span style={{ color: C.accent, fontWeight: 700 }}>Web Monetized</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!disabled) activate();
                          }}
                          disabled={disabled}
                          style={{
                            ...S.playBtn,
                            background: disabled ? C.line : `linear-gradient(135deg, ${C.accent}, ${C.accentDeep})`,
                            color: disabled ? C.dim : "#fff",
                            cursor: disabled ? "not-allowed" : "pointer",
                            boxShadow: disabled ? "none" : "0 4px 12px rgba(124,58,237,0.35)",
                          }}
                          className="s-btn"
                        >
                          {isActive && sessionId ? "Stop" : "▶ Play"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function WmStatusPill({ state }: { state: WMState }) {
  const map: Record<WMState, { label: string; color: string; bg: string; border: string; dot?: boolean }> = {
    active: { label: "Streaming", color: C.green, bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.4)", dot: true },
    pending: { label: "Connecting", color: C.amber, bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.4)" },
    idle: { label: "Ready", color: C.accent, bg: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.35)" },
    stopped: { label: "Paused", color: C.dim, bg: C.panelSoft, border: C.line },
    unsupported: { label: "No WM agent", color: C.amber, bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.35)" },
    unconfigured: { label: "Not configured", color: C.amber, bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.35)" },
  };
  const s = map[state];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        flexShrink: 0,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.03em",
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 999,
        padding: "5px 11px",
      }}
    >
      {s.dot && <span className="s-live" />}
      {s.label}
    </span>
  );
}

function BillingCell({ label, value, color, live, caption }: { label: string; value: string; color: string; live?: boolean; caption?: string }) {
  return (
    <div style={S.cell}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div
        style={{ fontSize: 19, fontWeight: 900, color, marginTop: 3, fontVariantNumeric: "tabular-nums" }}
        className={live ? "s-meter" : undefined}
      >
        {value}
      </div>
      {caption && <div style={{ fontSize: 10.5, color: C.dim, marginTop: 2 }}>{caption}</div>}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  layout: {
    width: "100%",
  },
  panel: {
    background: C.panel,
    border: `1px solid ${C.line}`,
    borderRadius: 18,
    padding: "1.5rem",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    color: C.text,
    fontFamily: "'Inter', system-ui, sans-serif",
    minWidth: 0,
  },
  sidePanel: {
    background: C.panel,
    border: `1px solid ${C.line}`,
    borderRadius: 18,
    padding: "1.25rem",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    color: C.text,
    fontFamily: "'Inter', system-ui, sans-serif",
    position: "sticky",
    top: 78,
    maxHeight: "calc(100vh - 96px)",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  catalogScroll: {
    overflowY: "auto",
    overflowX: "hidden",
    paddingRight: 6,
    marginRight: -6,
    flex: 1,
    minHeight: 0,
  },
  iconTileSm: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 9,
    fontSize: 16,
    background: "rgba(168,85,247,0.12)",
    border: "1px solid rgba(168,85,247,0.35)",
    flexShrink: 0,
  },
  iconTile: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: 10,
    fontSize: 18,
    background: "rgba(168,85,247,0.12)",
    border: "1px solid rgba(168,85,247,0.35)",
  },
  stage: {
    border: `1px solid ${C.line}`,
    borderRadius: 16,
    padding: "1.25rem",
    marginBottom: 18,
    background: "linear-gradient(160deg, rgba(168,85,247,0.06), #0f1729)",
  },
  videoFrame: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid rgba(168,85,247,0.35)",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.4), 0 12px 30px rgba(0,0,0,0.5)",
    background: "#000",
  },
  video: { width: "100%", display: "block", aspectRatio: "16 / 9", background: "#000" },
  livePill: {
    position: "absolute",
    top: 12,
    left: 12,
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "5px 11px",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.08em",
    color: "#fff",
    background: "rgba(11,17,32,0.7)",
    border: "1px solid rgba(168,85,247,0.5)",
    borderRadius: 999,
    backdropFilter: "blur(6px)",
  },
  posterTile: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 46,
    height: 46,
    borderRadius: 12,
    fontSize: 26,
    background: C.panelSoft,
    border: `1px solid ${C.line}`,
  },
  posterTileSm: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 38,
    height: 38,
    borderRadius: 10,
    fontSize: 22,
    background: C.panel,
    border: `1px solid ${C.line}`,
    flexShrink: 0,
  },
  stopBtn: {
    padding: "0.6rem 1.25rem",
    background: `linear-gradient(135deg, ${C.accent}, ${C.accentDeep})`,
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    boxShadow: "0 6px 16px rgba(124,58,237,0.4)",
  },
  cellGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 10, marginTop: 16 },
  cell: {
    background: C.panelSoft,
    border: `1px solid ${C.line}`,
    borderRadius: 12,
    padding: "0.7rem 0.85rem",
  },
  barTrack: {
    marginTop: 12,
    height: 8,
    background: C.panelSoft,
    border: `1px solid ${C.line}`,
    borderRadius: 999,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    background: `linear-gradient(90deg, ${C.accentDeep}, ${C.accent})`,
    borderRadius: 999,
  },
  priceChip: {
    position: "absolute",
    top: 12,
    right: 12,
    padding: "5px 11px",
    fontSize: 12,
    fontWeight: 800,
    color: "#fff",
    background: "rgba(11,17,32,0.7)",
    border: `1px solid ${C.line}`,
    borderRadius: 999,
    backdropFilter: "blur(6px)",
    fontVariantNumeric: "tabular-nums",
  },
  badge: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: C.accent,
    background: "rgba(168,85,247,0.12)",
    border: "1px solid rgba(168,85,247,0.35)",
    borderRadius: 999,
    padding: "2px 8px",
    flexShrink: 0,
  },
  progressLabel: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: C.dim,
    margin: "16px 0 6px",
    fontVariantNumeric: "tabular-nums",
  },
  fineprint: { fontSize: 11.5, color: C.dim, margin: "12px 0 0", lineHeight: 1.5 },
  wmNotice: {
    fontSize: 12.5,
    lineHeight: 1.5,
    color: C.amber,
    background: "rgba(251,191,36,0.08)",
    border: "1px solid rgba(251,191,36,0.3)",
    borderRadius: 12,
    padding: "0.8rem 1rem",
    marginBottom: 16,
  },
  hero: {
    borderRadius: 16,
    marginBottom: 18,
    border: `1px solid ${C.line}`,
    background: "linear-gradient(160deg, rgba(168,85,247,0.08), #0f1729)",
    aspectRatio: "16 / 7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "1.5rem",
  },
  heroInner: { maxWidth: 380 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 999,
    margin: "0 auto 12px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    color: "#fff",
    background: `linear-gradient(135deg, ${C.accent}, ${C.accentDeep})`,
    boxShadow: "0 8px 20px rgba(124,58,237,0.4)",
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: C.dim,
    margin: "0 0 10px",
  },
  message: { color: C.dim, fontSize: 13.5, margin: "0 0 16px" },
  catalog: { display: "grid", gridTemplateColumns: "1fr", gap: 10 },
  contentCard: {
    border: "1px solid",
    borderRadius: 12,
    padding: "0.8rem 0.95rem",
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  playBtn: {
    padding: "0.4rem 0.9rem",
    border: "none",
    borderRadius: 8,
    fontWeight: 800,
    fontSize: 12,
    flexShrink: 0,
  },
};
