import type { TelemetryBatch } from "./telemetryTypes";

/**
 * TelemetryStore
 * --------------
 * In-memory aggregation of engagement events, keyed by video. This is the
 * read model behind the analytics dashboard. Like the rate limiter it is
 * process-local: great for a single-node MVP, swap for a real store to scale.
 *
 * Memory profile: O(videos × active sessions). Per session we keep only the
 * latest monotonic `watchedSec` (a single number), so heartbeats don't
 * accumulate — they overwrite.
 */
export interface VideoStats {
  videoId: string;
  sessions: number;
  totalWatchedSec: number;
  plays: number;
  pauses: number;
  completions: number;
  visibilityLosses: number; // tab hidden -> auto-pause
  intersectionDrops: number; // scrolled < 90% -> auto-pause
  lastEventTs: number;
  /** 0–100. How much of attention stayed on the video vs. drifted away. */
  focusScore: number;
}

interface VideoAgg {
  /** sessionId -> latest reported watchedSec (monotonic, so we take the max). */
  sessions: Map<string, number>;
  plays: number;
  pauses: number;
  completions: number;
  visibilityLosses: number;
  intersectionDrops: number;
  lastEventTs: number;
}

/**
 * Distraction penalty (seconds of "lost engagement" charged per auto-pause)
 * used to translate raw distraction counts into the focus score.
 */
const DISTRACTION_PENALTY_SEC = 8;

function computeFocusScore(watchedSec: number, distractions: number): number {
  if (watchedSec <= 0) return 0;
  const penalty = distractions * DISTRACTION_PENALTY_SEC;
  const score = (watchedSec / (watchedSec + penalty)) * 100;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export class TelemetryStore {
  private readonly videos = new Map<string, VideoAgg>();

  private agg(videoId: string): VideoAgg {
    let a = this.videos.get(videoId);
    if (!a) {
      a = {
        sessions: new Map(),
        plays: 0,
        pauses: 0,
        completions: 0,
        visibilityLosses: 0,
        intersectionDrops: 0,
        lastEventTs: 0,
      };
      this.videos.set(videoId, a);
    }
    return a;
  }

  /** Fold one batch into the aggregates. */
  public record(batch: TelemetryBatch): void {
    const a = this.agg(batch.videoId);

    for (const e of batch.events) {
      a.lastEventTs = Math.max(a.lastEventTs, e.ts);

      if (typeof e.watchedSec === "number") {
        const prev = a.sessions.get(batch.sessionId) ?? 0;
        // watchedSec is monotonic per session; keep the high-water mark.
        a.sessions.set(batch.sessionId, Math.max(prev, e.watchedSec));
      } else if (!a.sessions.has(batch.sessionId)) {
        // Ensure the session is counted even before its first heartbeat.
        a.sessions.set(batch.sessionId, 0);
      }

      switch (e.type) {
        case "play":
          a.plays++;
          break;
        case "pause":
          a.pauses++;
          break;
        case "ended":
          a.completions++;
          break;
        case "visibility_lost":
          a.visibilityLosses++;
          break;
        case "intersection_drop":
          a.intersectionDrops++;
          break;
        default:
          break;
      }
    }
  }

  private toStats(videoId: string, a: VideoAgg): VideoStats {
    let totalWatchedSec = 0;
    for (const sec of a.sessions.values()) totalWatchedSec += sec;
    const distractions = a.visibilityLosses + a.intersectionDrops;
    return {
      videoId,
      sessions: a.sessions.size,
      totalWatchedSec: Math.round(totalWatchedSec),
      plays: a.plays,
      pauses: a.pauses,
      completions: a.completions,
      visibilityLosses: a.visibilityLosses,
      intersectionDrops: a.intersectionDrops,
      lastEventTs: a.lastEventTs,
      focusScore: computeFocusScore(totalWatchedSec, distractions),
    };
  }

  /** Snapshot for one video, or undefined if nothing recorded yet. */
  public statsFor(videoId: string): VideoStats | undefined {
    const a = this.videos.get(videoId);
    return a ? this.toStats(videoId, a) : undefined;
  }

  /** Snapshot of every video with data, newest activity first. */
  public allStats(): VideoStats[] {
    return [...this.videos.entries()]
      .map(([id, a]) => this.toStats(id, a))
      .sort((x, y) => y.lastEventTs - x.lastEventTs);
  }
}

// Process-wide singleton, hot-reload safe (see lib/rateLimiter.ts for rationale).
declare global {
  // eslint-disable-next-line no-var
  var __focustubeTelemetryStore: TelemetryStore | undefined;
}

export const telemetryStore: TelemetryStore =
  globalThis.__focustubeTelemetryStore ??
  (globalThis.__focustubeTelemetryStore = new TelemetryStore());
