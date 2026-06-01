/**
 * Shared telemetry contract between the browser client and the ingestion route.
 */

export type TelemetryEventType =
  | "play"
  | "pause"
  | "playtime" // periodic heartbeat carrying accumulated watch seconds
  | "visibility_lost" // Page Visibility API: tab hidden -> auto-pause
  | "visibility_restored"
  | "intersection_drop" // IntersectionObserver: scrolled < 90% -> auto-pause
  | "intersection_restored"
  | "ended"
  | "seek";

export interface TelemetryEvent {
  type: TelemetryEventType;
  /** epoch ms when the event was captured on the client. */
  ts: number;
  /** Current media position in seconds, when relevant. */
  positionSec?: number;
  /** Accumulated foreground watch time in seconds, for `playtime` events. */
  watchedSec?: number;
  /** IntersectionObserver ratio at the moment of the event (0..1). */
  intersectionRatio?: number;
  /** Free-form annotation for debugging. */
  note?: string;
}

export interface TelemetryBatch {
  sessionId: string;
  videoId: string;
  /** Client clock at flush time; lets the server estimate clock skew. */
  sentAt: number;
  events: TelemetryEvent[];
}
