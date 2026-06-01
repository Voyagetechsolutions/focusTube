"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TelemetryClient } from "@/lib/telemetryClient";

export interface VideoPlayerProps {
  /** Direct media URL (mp4/webm). NOT an iframe embed — iframes are forbidden. */
  src: string;
  videoId: string;
  poster?: string;
  /** Minimum visible ratio before the player is allowed to keep playing. */
  visibilityThreshold?: number;
}

type PauseReason = "user" | "hidden" | "offscreen" | null;

function makeSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Seconds → m:ss. */
function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Human-readable explanation for an HTMLMediaElement error. */
function describeMediaError(err: MediaError | null): string {
  switch (err?.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "Loading was aborted.";
    case MediaError.MEDIA_ERR_NETWORK:
      return "A network error interrupted the download.";
    case MediaError.MEDIA_ERR_DECODE:
      return "The video is corrupt or uses an unsupported codec.";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "The video source couldn't be loaded (bad URL, 403/404, or CORS).";
    default:
      return "The video could not be loaded.";
  }
}

/**
 * VideoPlayer
 * -----------
 * A zero-distraction HTML5 video player. Two native browser APIs enforce focus:
 *
 *  1. Page Visibility API — pauses the instant the tab is hidden.
 *  2. IntersectionObserver — pauses when < 90% of the player is on screen.
 *
 * All engagement is streamed to the backend through {@link TelemetryClient}.
 */
export default function VideoPlayer({
  src,
  videoId,
  poster,
  visibilityThreshold = 0.9,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const telemetryRef = useRef<TelemetryClient | null>(null);

  // Why the player is currently paused. Auto-pause reasons block manual play
  // until the underlying condition (visible + on-screen) clears.
  const pauseReasonRef = useRef<PauseReason>(null);

  // Accumulated foreground watch time, advanced by the heartbeat.
  const watchedSecRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState<string>("Ready");
  const [intersection, setIntersection] = useState(1);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  // Focus streak: uninterrupted focused-watch seconds; resets on any break.
  const [streakSec, setStreakSec] = useState(0);
  const [bestStreakSec, setBestStreakSec] = useState(0);

  const telemetry = () => telemetryRef.current;

  /** Pause and remember why, so auto-pauses aren't overridden by the user. */
  const pauseFor = useCallback((reason: Exclude<PauseReason, null>) => {
    const v = videoRef.current;
    if (!v) return;
    pauseReasonRef.current = reason;
    if (!v.paused) v.pause();
  }, []);

  /** Clear an auto-pause condition; resume only if nothing else blocks us. */
  const clearAutoPause = useCallback(
    (reason: Exclude<PauseReason, null>) => {
      if (pauseReasonRef.current === reason) {
        pauseReasonRef.current = null;
      }
    },
    []
  );

  // --- Page Visibility API ---------------------------------------------------
  useEffect(() => {
    const onVisibilityChange = () => {
      const v = videoRef.current;
      if (!v) return;
      if (document.hidden) {
        if (!v.paused) {
          telemetry()?.log("visibility_lost", { positionSec: v.currentTime });
          setStatus("Paused — tab hidden");
        }
        pauseFor("hidden");
      } else {
        telemetry()?.log("visibility_restored", { positionSec: v.currentTime });
        clearAutoPause("hidden");
        setStatus("Tab visible — press play to resume");
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [pauseFor, clearAutoPause]);

  // --- IntersectionObserver --------------------------------------------------
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const ratio = entry.intersectionRatio;
          setIntersection(ratio);

          if (ratio < visibilityThreshold) {
            const vid = videoRef.current;
            if (vid && !vid.paused) {
              telemetry()?.log("intersection_drop", {
                positionSec: vid.currentTime,
                intersectionRatio: ratio,
              });
              setStatus(`Paused — only ${Math.round(ratio * 100)}% on screen`);
            }
            pauseFor("offscreen");
          } else {
            telemetry()?.log("intersection_restored", {
              intersectionRatio: ratio,
            });
            clearAutoPause("offscreen");
            setStatus("In view — press play to resume");
          }
        }
      },
      // threshold: [0.9] — fire as the player crosses the 90% visibility line.
      { threshold: [visibilityThreshold] }
    );

    observer.observe(v);
    return () => observer.disconnect();
  }, [visibilityThreshold, pauseFor, clearAutoPause]);

  // --- Telemetry lifecycle + media event wiring ------------------------------
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const client = new TelemetryClient(makeSessionId(), videoId);
    telemetryRef.current = client;
    client.start();

    const onPlay = () => {
      setIsPlaying(true);
      lastTickRef.current = Date.now();
      client.log("play", { positionSec: v.currentTime });
      setStatus("Playing");
    };
    const onPause = () => {
      setIsPlaying(false);
      // Fold the final partial interval into watch time before stopping.
      flushWatchTick();
      // Any pause — user, tab-hide, or off-screen — breaks the focus streak.
      setStreakSec(0);
      client.log("pause", { positionSec: v.currentTime });
    };
    const onEnded = () => {
      flushWatchTick();
      client.log("ended", { positionSec: v.currentTime });
      setStatus("Finished");
    };
    const onSeeked = () =>
      client.log("seek", { positionSec: v.currentTime });
    const onError = () => {
      setIsPlaying(false);
      setStatus(`⚠ ${describeMediaError(v.error)}`);
    };
    const onStalled = () => setStatus("Buffering…");
    const onWaiting = () => setStatus("Buffering…");
    const onPlaying = () => setStatus("Playing");
    const onTimeUpdate = () => setCurrentSec(v.currentTime);
    const onLoadedMeta = () => setDurationSec(v.duration || 0);

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("error", onError);
    v.addEventListener("stalled", onStalled);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("loadedmetadata", onLoadedMeta);

    // Heartbeat: every 1s of foreground playback, accrue watch time and emit a
    // periodic `playtime` event (cheap, batched by the client).
    const heartbeat = setInterval(() => {
      if (!v.paused && !document.hidden) {
        flushWatchTick();
        client.log("playtime", {
          positionSec: v.currentTime,
          watchedSec: Math.round(watchedSecRef.current),
        });
        // Grow the uninterrupted focus streak and track the session best.
        setStreakSec((s) => {
          const next = s + 1;
          setBestStreakSec((b) => Math.max(b, next));
          return next;
        });
      }
    }, 1_000);

    function flushWatchTick() {
      const now = Date.now();
      if (lastTickRef.current != null && !v!.paused && !document.hidden) {
        watchedSecRef.current += (now - lastTickRef.current) / 1000;
      }
      lastTickRef.current = now;
    }

    return () => {
      clearInterval(heartbeat);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("error", onError);
      v.removeEventListener("stalled", onStalled);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("loadedmetadata", onLoadedMeta);
      client.stop(); // beacons any remaining events
      telemetryRef.current = null;
    };
  }, [videoId]);

  /** User-initiated play, blocked while an auto-pause condition is active. */
  const handlePlayClick = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;

    if (document.hidden) {
      setStatus("Can't play — tab is hidden");
      return;
    }
    if (intersection < visibilityThreshold) {
      setStatus("Can't play — scroll the player fully into view");
      return;
    }
    pauseReasonRef.current = null;
    setStatus("Loading…");
    void v.play().catch((err: unknown) => {
      const name = err instanceof DOMException ? err.name : "";
      // AbortError: play() was interrupted by a pause() (e.g. an auto-pause
      // fired the same instant) — harmless, the player simply stayed paused.
      if (name === "AbortError") return;
      // NotAllowedError: the browser's autoplay policy rejected playback.
      if (name === "NotAllowedError") {
        setStatus("Autoplay blocked — click ▶ Play once more");
        return;
      }
      // Otherwise it's almost always a media-load failure; surface the cause.
      setStatus(`⚠ ${describeMediaError(v.error)}`);
    });
  }, [intersection, visibilityThreshold]);

  const handlePauseClick = useCallback(() => {
    pauseFor("user");
  }, [pauseFor]);

  /** Click-to-seek on the progress track. */
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * v.duration;
    setCurrentSec(v.currentTime);
  }, []);

  const progressPct =
    durationSec > 0 ? Math.min(100, (currentSec / durationSec) * 100) : 0;
  const inView = intersection >= visibilityThreshold;
  // Streak bar fills toward a 60s "deep focus" milestone.
  const streakPct = Math.min(100, (streakSec / 60) * 100);

  return (
    <div className="w-full">
      <div
        className={`relative overflow-hidden rounded-2xl border bg-black shadow-card transition-shadow duration-500 ${
          isPlaying ? "border-focus-accent/40 shadow-glow" : "border-fg/10"
        }`}
      >
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          playsInline
          preload="metadata"
          className="aspect-video w-full bg-black"
          // No `controls`: we drive playback through our focus-aware buttons so
          // visibility/intersection rules can't be bypassed by native UI.
        />

        {/* Focus-state HUD */}
        <div className="pointer-events-none absolute left-3 top-3 flex gap-2 text-xs">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium backdrop-blur ${
              isPlaying
                ? "bg-focus-ok/20 text-focus-ok"
                : "bg-black/40 text-white/70"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isPlaying ? "animate-pulseGlow bg-focus-ok" : "bg-white/50"
              }`}
            />
            {isPlaying ? "Live focus" : "Paused"}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 font-medium backdrop-blur ${
              inView
                ? "bg-focus-accent/20 text-focus-accent"
                : "bg-focus-warn/20 text-focus-warn"
            }`}
          >
            {Math.round(intersection * 100)}% visible
          </span>
        </div>

        {/* Center play button when paused */}
        {!isPlaying && (
          <button
            onClick={handlePlayClick}
            aria-label="Play"
            className="group absolute inset-0 grid place-items-center bg-black/30 transition hover:bg-black/40"
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-gradient text-white shadow-glow transition group-hover:scale-105">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        )}

        {/* Progress bar */}
        <div className="absolute inset-x-0 bottom-0 px-3 pb-2.5">
          <div
            onClick={handleSeek}
            className="group h-1.5 w-full cursor-pointer rounded-full bg-white/15"
          >
            <div
              className="relative h-full rounded-full bg-brand-gradient transition-[width] duration-150"
              style={{ width: `${progressPct}%` }}
            >
              <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition group-hover:opacity-100" />
            </div>
          </div>
          <div className="mt-1 flex justify-between text-[11px] font-medium tabular-nums text-white/70">
            <span>{fmtTime(currentSec)}</span>
            <span>{fmtTime(durationSec)}</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {isPlaying ? (
          <button
            onClick={handlePauseClick}
            className="flex items-center gap-2 rounded-xl bg-fg/10 px-5 py-2.5 text-sm font-semibold transition hover:bg-fg/15"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
            Pause
          </button>
        ) : (
          <button
            onClick={handlePlayClick}
            className="flex items-center gap-2 rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-90"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play
          </button>
        )}
        <span className="flex items-center gap-2 text-sm text-fg/55">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status.startsWith("⚠")
                ? "bg-focus-danger"
                : isPlaying
                  ? "bg-focus-ok"
                  : "bg-fg/40"
            }`}
          />
          {status}
        </span>
      </div>

      {/* Focus streak meter */}
      <div className="mt-4 rounded-2xl glass p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-fg/80">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={streakSec > 0 ? "text-focus-warn" : "text-fg/40"}
            >
              <path d="M12 2c1 3-1 4-2 6-1 2 0 4 2 4 1.5 0 2-1 2-2 2 1 3 3 3 5a5 5 0 1 1-10 0c0-3 2-5 3-7 .8-1.6 1.8-3.4 2-6z" />
            </svg>
            Focus streak
          </span>
          <span className="text-xs tabular-nums text-fg/45">
            best {fmtTime(bestStreakSec)}
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <span
            className="min-w-[3.5rem] text-2xl font-bold tabular-nums"
            style={{ color: streakSec > 0 ? "#f59e2c" : undefined }}
          >
            {fmtTime(streakSec)}
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-fg/8">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${streakPct}%`,
                background: "linear-gradient(90deg,#f59e2c,#21c08a)",
              }}
            />
          </div>
          <span className="text-xs tabular-nums text-fg/40">60s</span>
        </div>
        <p className="mt-2 text-xs text-fg/45">
          Uninterrupted focused watching. Switching tabs or scrolling away
          resets it.
        </p>
      </div>
    </div>
  );
}
