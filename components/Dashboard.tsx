"use client";

import { useEffect, useRef, useState } from "react";

interface VideoRow {
  videoId: string;
  title: string;
  creator: string;
  poster?: string;
  sessions: number;
  totalWatchedSec: number;
  plays: number;
  pauses: number;
  completions: number;
  visibilityLosses: number;
  intersectionDrops: number;
  focusScore: number;
  lastEventTs: number;
}

interface Analytics {
  totals: {
    sessions: number;
    totalWatchedSec: number;
    visibilityLosses: number;
    intersectionDrops: number;
  };
  videos: VideoRow[];
  generatedAt: number;
}

const REFRESH_MS = 3_000;

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function scoreColor(score: number): string {
  if (score >= 75) return "#21c08a";
  if (score >= 45) return "#f59e2c";
  return "#f0455a";
}

/**
 * Animate a number toward `target` with an ease-out cubic. Continues smoothly
 * from the currently displayed value if the target changes mid-flight.
 */
function useCountUp(target: number, duration = 700): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);

  useEffect(() => {
    const from = displayRef.current;
    const to = target;
    if (from === to) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = from + (to - from) * eased;
      displayRef.current = cur;
      setDisplay(cur);
      if (t < 1) raf = requestAnimationFrame(step);
      else {
        displayRef.current = to;
        setDisplay(to);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}

export default function Dashboard() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/analytics", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: Analytics = await res.json();
        if (active) {
          setData(json);
          setError(null);
          setLive(true);
          setTimeout(() => active && setLive(false), 600);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "fetch failed");
      }
    };
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (error && !data) {
    return (
      <div className="rounded-2xl glass p-6 text-focus-danger">
        Failed to load analytics: {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-2xl glass p-6 text-fg/50">Loading analytics…</div>
    );
  }

  const { totals, videos } = data;
  const maxWatch = Math.max(1, ...videos.map((v) => v.totalWatchedSec));

  return (
    <div className="animate-fadeUp">
      {/* Live indicator */}
      <div className="mb-5 flex items-center gap-2 text-xs text-fg/45">
        <span
          className={`h-2 w-2 rounded-full transition ${
            live ? "bg-focus-ok shadow-[0_0_8px_#21c08a]" : "bg-fg/30"
          }`}
        />
        Live · refreshing every {REFRESH_MS / 1000}s
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Sessions"
          value={totals.sessions}
          format={(n) => String(Math.round(n))}
          tint="#6c8cff"
          icon="👥"
        />
        <StatCard
          label="Watch time"
          value={totals.totalWatchedSec}
          format={(n) => fmtDuration(n)}
          tint="#a472ff"
          icon="⏱️"
        />
        <StatCard
          label="Tab-hide pauses"
          value={totals.visibilityLosses}
          format={(n) => String(Math.round(n))}
          tint="#f59e2c"
          icon="🗂️"
        />
        <StatCard
          label="Off-screen pauses"
          value={totals.intersectionDrops}
          format={(n) => String(Math.round(n))}
          tint="#4cd6c8"
          icon="📜"
        />
      </div>

      {/* Per-video cards */}
      <h2 className="mb-4 mt-10 text-sm font-semibold uppercase tracking-widest text-fg/40">
        Per video
      </h2>
      <div className="space-y-3">
        {videos.map((v) => (
          <VideoStatRow key={v.videoId} v={v} maxWatch={maxWatch} />
        ))}
      </div>

      <p className="mt-5 text-xs text-fg/40">
        Focus score = watch time ÷ (watch time + 8s × distractions), as a
        percentage. Higher means attention stayed on the video.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  format,
  tint,
  icon,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  tint: string;
  icon: string;
}) {
  const animated = useCountUp(value);
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-fg/10 bg-surface2 p-4"
      style={{
        backgroundImage: `radial-gradient(120% 120% at 0% 0%, ${tint}22, transparent 60%)`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-fg/45">
          {label}
        </span>
        <span className="text-base opacity-80">{icon}</span>
      </div>
      <div className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
        {format(animated)}
      </div>
      <div
        className="absolute inset-x-0 bottom-0 h-0.5"
        style={{ background: tint }}
      />
    </div>
  );
}

function VideoStatRow({ v, maxWatch }: { v: VideoRow; maxWatch: number }) {
  const hasData = v.sessions > 0;
  const color = scoreColor(v.focusScore);
  const score = useCountUp(hasData ? v.focusScore : 0);
  const watchPct = useCountUp((v.totalWatchedSec / maxWatch) * 100);

  return (
    <div className="rounded-2xl border border-fg/10 bg-surface2 p-4 transition hover:border-fg/20 sm:p-5">
      <div className="flex items-center gap-4">
        {/* Focus score ring */}
        <div className="relative grid h-16 w-16 shrink-0 place-items-center">
          <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
            <circle
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              strokeWidth="3"
              className="stroke-fg/10"
            />
            <circle
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              stroke={hasData ? color : "currentColor"}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${score} 100`}
              className="text-fg/15"
            />
          </svg>
          <span
            className={`absolute text-sm font-bold tabular-nums ${
              hasData ? "" : "text-fg/40"
            }`}
            style={hasData ? { color } : undefined}
          >
            {hasData ? Math.round(score) : "—"}
          </span>
        </div>

        {/* Title + watch bar */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="truncate font-semibold">{v.title}</h3>
            <span className="shrink-0 text-xs text-fg/40">
              {v.sessions} {v.sessions === 1 ? "session" : "sessions"}
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-fg/8">
            <div
              className="h-full rounded-full bg-brand-gradient"
              style={{ width: `${watchPct}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip label={`${fmtDuration(v.totalWatchedSec)} watched`} />
            <Chip label={`${v.plays} plays`} />
            <Chip
              label={`${v.visibilityLosses} tab-hide`}
              tone={v.visibilityLosses > 0 ? "warn" : undefined}
            />
            <Chip
              label={`${v.intersectionDrops} off-screen`}
              tone={v.intersectionDrops > 0 ? "warn" : undefined}
            />
            {v.completions > 0 && (
              <Chip label={`${v.completions} finished`} tone="ok" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, tone }: { label: string; tone?: "ok" | "warn" }) {
  const tones = {
    ok: "bg-focus-ok/15 text-focus-ok",
    warn: "bg-focus-warn/15 text-focus-warn",
  } as const;
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
        tone ? tones[tone] : "bg-fg/8 text-fg/60"
      }`}
    >
      {label}
    </span>
  );
}
