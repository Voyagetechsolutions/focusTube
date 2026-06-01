import type {
  TelemetryBatch,
  TelemetryEvent,
  TelemetryEventType,
} from "./telemetryTypes";

const FLUSH_INTERVAL_MS = 5_000;
const ENDPOINT = "/api/telemetry";

/**
 * gzip-compress a UTF-8 string using the native CompressionStream API.
 * Returns a Blob tagged `application/gzip`. Falls back to an uncompressed
 * Blob on browsers without CompressionStream (older Safari).
 */
async function gzipJson(payload: string): Promise<Blob> {
  const bytes = new TextEncoder().encode(payload);
  if (typeof CompressionStream === "undefined") {
    return new Blob([bytes], { type: "application/json" });
  }
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const compressed = await new Response(stream).arrayBuffer();
  return new Blob([compressed], { type: "application/gzip" });
}

/**
 * TelemetryClient
 * ---------------
 * Lightweight in-memory event batcher.
 *
 *  • enqueue()  — O(1) push into a plain array (no allocation churn).
 *  • flush()    — every 5s, gzip the queue and POST it via fetch.
 *  • beacon()   — on tab-hide / pagehide, ship whatever remains with
 *                 navigator.sendBeacon so it survives context teardown.
 *
 * The queue is drained atomically into a local before any async work, so
 * events captured mid-flush are never dropped or double-sent.
 */
export class TelemetryClient {
  private queue: TelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly boundLifecycle: () => void;

  constructor(
    private readonly sessionId: string,
    private readonly videoId: string
  ) {
    this.boundLifecycle = this.handleLifecycle.bind(this);
  }

  /** Begin the 5s flush loop and register unload hooks. */
  public start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);

    // `visibilitychange` (hidden) is the most reliable cross-browser unload
    // signal; `pagehide` covers bfcache navigations. Both trigger a beacon.
    document.addEventListener("visibilitychange", this.boundLifecycle);
    window.addEventListener("pagehide", this.boundLifecycle);
  }

  /** Stop timers and remove listeners (component unmount). */
  public stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    document.removeEventListener("visibilitychange", this.boundLifecycle);
    window.removeEventListener("pagehide", this.boundLifecycle);
    // Best-effort final drain.
    this.beacon();
  }

  /** Record an event. Cheap; safe to call on hot paths. */
  public log(
    type: TelemetryEventType,
    extra: Partial<Omit<TelemetryEvent, "type" | "ts">> = {}
  ): void {
    this.queue.push({ type, ts: Date.now(), ...extra });
  }

  /** Drain the queue into a batch envelope, or null if empty. */
  private drain(): TelemetryBatch | null {
    if (this.queue.length === 0) return null;
    const events = this.queue;
    this.queue = [];
    return {
      sessionId: this.sessionId,
      videoId: this.videoId,
      sentAt: Date.now(),
      events,
    };
  }

  /** Async flush via fetch with a gzip-compressed JSON body. */
  public async flush(): Promise<void> {
    const batch = this.drain();
    if (!batch) return;

    try {
      const body = await gzipJson(JSON.stringify(batch));
      const res = await fetch(ENDPOINT, {
        method: "POST",
        keepalive: true, // lets the request outlive a same-tab navigation
        headers: {
          "Content-Type": body.type,
          "Content-Encoding": body.type === "application/gzip" ? "gzip" : "identity",
        },
        body,
      });
      // On throttle, requeue so nothing is lost; the next tick retries.
      if (res.status === 429) {
        this.queue.unshift(...batch.events);
      }
    } catch {
      // Network error — put the events back for the next interval.
      this.queue.unshift(...batch.events);
    }
  }

  /**
   * Synchronous, fire-and-forget transmit for page teardown. sendBeacon
   * queues the request in the browser's background and is guaranteed a send
   * attempt even as the document unloads. We skip gzip here to keep it sync.
   */
  public beacon(): void {
    const batch = this.drain();
    if (!batch) return;
    const blob = new Blob([JSON.stringify(batch)], {
      type: "application/json",
    });
    const ok =
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(ENDPOINT, blob);
    // If the beacon was rejected (e.g. payload too large), requeue so a later
    // flush can still try.
    if (!ok) this.queue.unshift(...batch.events);
  }

  private handleLifecycle(): void {
    // Only beacon when the page is actually going away / backgrounded.
    if (document.visibilityState === "hidden") {
      this.beacon();
    }
  }
}
