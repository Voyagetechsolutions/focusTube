/**
 * TokenBucket
 * -----------
 * A dependency-free, in-memory token bucket implementing the classic
 * continuous-refill state equation:
 *
 *     T_new = min(B, T_old + r * Δt)
 *
 *   B  = burst capacity   (max tokens the bucket can hold)
 *   r  = refill rate      (tokens added per second)
 *   Δt = seconds elapsed since the last observed request
 *
 * The bucket is "lazy": it does not run a timer. Tokens are recomputed on
 * demand at the moment a request arrives, so an idle bucket costs nothing
 * but a few numbers in memory. This makes it cheap to keep one bucket per
 * client without a background scheduler.
 */
export class TokenBucket {
  /** Burst capacity, B. */
  public readonly capacity: number;
  /** Refill rate in tokens/second, r. */
  public readonly refillRatePerSec: number;

  /** Current token count (fractional — partial refills accumulate). */
  private tokens: number;
  /** Timestamp (ms) of the last refill computation. */
  private lastRefillMs: number;

  /**
   * @param capacity         Burst capacity B (must be > 0).
   * @param refillRatePerSec Refill rate r in tokens/second (must be > 0).
   * @param now              Injectable clock for deterministic tests.
   */
  constructor(
    capacity: number,
    refillRatePerSec: number,
    now: number = Date.now()
  ) {
    if (capacity <= 0) throw new RangeError("capacity (B) must be > 0");
    if (refillRatePerSec <= 0)
      throw new RangeError("refillRatePerSec (r) must be > 0");

    this.capacity = capacity;
    this.refillRatePerSec = refillRatePerSec;
    this.tokens = capacity; // start full so the first burst is allowed
    this.lastRefillMs = now;
  }

  /**
   * Recompute the available tokens for the current instant using the state
   * equation. Idempotent within the same millisecond.
   */
  private refill(now: number): void {
    const deltaSec = (now - this.lastRefillMs) / 1000;
    if (deltaSec <= 0) return; // clock skew / same tick — nothing to add
    this.tokens = Math.min(
      this.capacity,
      this.tokens + deltaSec * this.refillRatePerSec
    );
    this.lastRefillMs = now;
  }

  /**
   * Attempt to consume `cost` tokens.
   *
   * Concurrency note: Node executes JS on a single thread, so the
   * refill → check → decrement sequence below runs atomically with respect
   * to other requests. There is no `await` between reading and mutating
   * `this.tokens`, so concurrent bursts cannot interleave and double-spend.
   *
   * @returns true if the request is allowed (tokens were deducted),
   *          false if the bucket is exhausted (caller should send 429).
   */
  public tryConsume(cost = 1, now: number = Date.now()): boolean {
    this.refill(now);
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }

  /** Current token count after refilling to `now`. Useful for headers/metrics. */
  public peek(now: number = Date.now()): number {
    this.refill(now);
    return this.tokens;
  }

  /**
   * Seconds until at least `cost` tokens are available. 0 if already
   * satisfiable. Drives the `Retry-After` response header.
   */
  public retryAfterSec(cost = 1, now: number = Date.now()): number {
    this.refill(now);
    if (this.tokens >= cost) return 0;
    const deficit = cost - this.tokens;
    return deficit / this.refillRatePerSec;
  }

  /** Timestamp of the last activity — used by the store to evict idle buckets. */
  public get lastSeenMs(): number {
    return this.lastRefillMs;
  }
}
