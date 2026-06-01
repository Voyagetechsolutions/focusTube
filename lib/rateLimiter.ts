import { TokenBucket } from "./TokenBucket";

/**
 * RateLimiterStore
 * ----------------
 * Keeps one {@link TokenBucket} per client key (e.g. IP address). Buckets are
 * created lazily on first contact and swept periodically so the map cannot
 * grow without bound under a churn of one-shot clients.
 *
 * Memory profile: O(active clients). Each entry is a single small object
 * (three numbers + key string). No per-bucket timers — refills are computed
 * lazily on access — so 10k tracked clients cost a few hundred KB, not 10k
 * setInterval handles.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds the client should wait before retrying (0 when allowed). */
  retryAfterSec: number;
  limit: number;
}

export class RateLimiterStore {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(
    /** Burst capacity B per client. */
    private readonly capacity: number,
    /** Refill rate r (tokens/sec) per client. */
    private readonly refillRatePerSec: number,
    /** Idle TTL (ms). Buckets untouched for this long are evicted. */
    private readonly idleTtlMs: number = 10 * 60_000
  ) {}

  /** Consume one token for `key`, creating the bucket on first sight. */
  public consume(key: string, cost = 1): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.capacity, this.refillRatePerSec, now);
      this.buckets.set(key, bucket);
    }

    const allowed = bucket.tryConsume(cost, now);
    return {
      allowed,
      remaining: Math.floor(bucket.peek(now)),
      retryAfterSec: allowed ? 0 : Math.ceil(bucket.retryAfterSec(cost, now)),
      limit: this.capacity,
    };
  }

  /** Evict buckets that have been idle past the TTL. Returns count removed. */
  public sweep(now: number = Date.now()): number {
    let removed = 0;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastSeenMs > this.idleTtlMs) {
        this.buckets.delete(key);
        removed++;
      }
    }
    return removed;
  }

  public get size(): number {
    return this.buckets.size;
  }
}

/**
 * Module-level singleton. In Next.js dev mode the route module can be
 * re-evaluated on hot reload, so we stash the instance on `globalThis` to keep
 * a single source of truth for the bucket state across reloads.
 *
 * Config: B = 20 burst, r = 5 tokens/sec. A client may fire a 20-event burst
 * instantly, then sustain 5 telemetry flushes/sec — comfortably above the
 * client's one-flush-per-5s cadence while still throttling abusive loops.
 */
const BURST_CAPACITY = 20;
const REFILL_RATE_PER_SEC = 5;

declare global {
  // eslint-disable-next-line no-var
  var __focustubeRateLimiter: RateLimiterStore | undefined;
}

export const telemetryRateLimiter: RateLimiterStore =
  globalThis.__focustubeRateLimiter ??
  (globalThis.__focustubeRateLimiter = new RateLimiterStore(
    BURST_CAPACITY,
    REFILL_RATE_PER_SEC
  ));

// Opportunistic background sweep. Guarded so we only register one interval even
// across hot reloads. `unref()` keeps it from holding the process open.
declare global {
  // eslint-disable-next-line no-var
  var __focustubeSweeper: NodeJS.Timeout | undefined;
}
if (!globalThis.__focustubeSweeper) {
  const handle = setInterval(() => telemetryRateLimiter.sweep(), 60_000);
  if (typeof handle.unref === "function") handle.unref();
  globalThis.__focustubeSweeper = handle;
}
