# FocusTube

A zero-distraction video platform prototype. Playback is enforced by two native
browser APIs — the moment your attention leaves (tab hidden, or the player
scrolled out of view), the video pauses. Every engagement signal is batched and
streamed to a backend protected by a hand-rolled token-bucket rate limiter.

No iframe embeds. No third-party video players. No third-party rate-limiting
middleware.

---

## File tree

```
focustube/
├── app/
│   ├── api/
│   │   ├── analytics/
│   │   │   └── route.ts        # Backend: read model for the dashboard (GET)
│   │   └── telemetry/
│   │       └── route.ts        # Backend: ingestion route + rate-limit enforcement (POST)
│   ├── dashboard/
│   │   └── page.tsx            # Live analytics page
│   ├── watch/
│   │   └── [id]/
│   │       └── page.tsx        # Per-video watch page (SSG, one per catalog entry)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                # Catalog grid (home)
├── components/
│   ├── Dashboard.tsx           # Frontend: polls /api/analytics, renders stats
│   ├── NavBar.tsx              # Shared nav (Catalog / Analytics)
│   └── VideoPlayer.tsx         # Frontend: focus-aware HTML5 player
├── lib/
│   ├── TokenBucket.ts          # Backend: isolated token-bucket algorithm
│   ├── rateLimiter.ts          # Backend: per-client bucket store + sweeper
│   ├── telemetryStore.ts       # Backend: in-memory engagement aggregation
│   ├── telemetryClient.ts      # Frontend: batching, 5s flush, sendBeacon
│   ├── telemetryTypes.ts       # Shared event/batch contract
│   └── catalog.ts              # Static video catalog (direct MP4s)
├── .eslintrc.json
├── .gitignore
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.ts
└── tsconfig.json
```

## Routes

| Route | Type | Purpose |
| --- | --- | --- |
| `/` | Static | Catalog grid of videos |
| `/watch/[id]` | SSG | Focus-enforcing player for one video |
| `/dashboard` | Static + client poll | Live engagement analytics |
| `POST /api/telemetry` | Dynamic | Ingest batched events (gzip-aware, rate-limited) |
| `GET /api/analytics` | Dynamic | Per-video aggregates for the dashboard |

## Data flow

```
VideoPlayer ──(focus events)──▶ TelemetryClient ──gzip POST/5s──▶ /api/telemetry
                                                       │ sendBeacon on unload
                                                       ▼
                              TokenBucket rate limit ──▶ TelemetryStore (aggregates)
                                                                 │
                                  Dashboard ◀──poll /3s── GET /api/analytics ◀┘
```

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # strict TS, no emit
```

Then:

1. On the **catalog** (`/`), open any video.
2. Press **Play**, switch browser tabs → playback pauses (Page Visibility API).
3. Press **Play**, scroll until < 90% of the player shows → it pauses (IntersectionObserver).
4. Open DevTools → **Network** and watch batched `POST /api/telemetry` every 5s;
   on tab-hide a final `sendBeacon` fires.
5. Open **/dashboard** in another tab to watch sessions, watch time, and
   distraction events (tab-hide / off-screen pauses) update live.

---

## Architecture

### Frontend — the "zero-distraction" player (`components/VideoPlayer.tsx`)

A bare `<video>` element (direct MP4, never an iframe) is wrapped in two
independent focus monitors. Each can independently latch the player into a
paused state, and **both** conditions must be clear before the user can resume —
this is the `pauseReason` state machine:

- **Page Visibility API** — a `visibilitychange` listener checks
  `document.hidden`. When true, the player is paused with reason `hidden`.
- **IntersectionObserver** — configured with `threshold: [0.9]`. When the
  reported `intersectionRatio` falls below `0.9`, the player is paused with
  reason `offscreen`.

Because auto-pauses are recorded with a reason, a manual **Play** click is
rejected while the tab is hidden or the player is off-screen — the UI can't be
used to defeat the focus rules.

### Backend — telemetry ingestion (`app/api/telemetry/route.ts`)

A Next.js Route Handler pinned to the Node.js runtime. It:

1. Derives a client key (`X-Forwarded-For` first hop).
2. Consumes one token from that client's bucket; returns **429 Too Many
   Requests** with a `Retry-After` header when exhausted.
3. Transparently `gunzip`s gzip-compressed bodies (`node:zlib`).
4. Validates the batch envelope and logs a compact summary.
5. Returns **204 No Content** — an empty body that suits both `fetch` and
   `sendBeacon`.

### Telemetry pipeline (`lib/telemetryClient.ts`)

- **Batching** — events accumulate in a plain in-memory array (`O(1)` push).
- **Flushing** — a 5-second interval drains the queue, gzip-compresses the JSON
  via the native `CompressionStream` API, and `POST`s it with
  `Content-Encoding: gzip` and `keepalive: true`.
- **Unload handling** — `visibilitychange` (state `hidden`) and `pagehide`
  trigger `navigator.sendBeacon()`, which the browser guarantees a send attempt
  for even as the document is torn down. The queue is drained atomically into a
  local before any async work, so events captured mid-flush are never dropped;
  on `429`/network error the batch is requeued for the next tick.

---

## Performance trade-offs

### IntersectionObserver vs. scroll listeners

A naive "is it on screen?" check wired to a `scroll` listener has three
structural problems that IntersectionObserver was designed to eliminate:

| Concern | `scroll` + `getBoundingClientRect()` | `IntersectionObserver` |
| --- | --- | --- |
| **Event volume** | `scroll` fires at up to display refresh rate (often 60–120 Hz). Each handler runs on the **main thread**. | Callbacks fire **only on threshold crossings** — here, just as visibility passes 90%. Near-zero idle cost. |
| **Layout thrashing** | `getBoundingClientRect()` forces a **synchronous reflow**. Reading it inside a high-frequency scroll handler interleaves reads and writes, causing forced layout recalcs each frame. | Intersection is computed by the browser **off the main thread** against the viewport; no layout is forced in your code. |
| **Jank** | Heavy scroll handlers block input/paint, producing dropped frames exactly while the user is scrolling. | Work is amortized and asynchronous; the scroll path stays clean. |

To even approximate IntersectionObserver with scroll listeners you'd add manual
`requestAnimationFrame` throttling, debouncing, and rect caching — reimplementing,
worse, what the browser already does natively. For a player that must react to a
single 90% threshold, IntersectionObserver is both simpler and dramatically
cheaper.

### Memory characteristics of the custom rate limiter

The limiter (`lib/TokenBucket.ts` + `lib/rateLimiter.ts`) is **lazy** and
**timer-free per client**:

- **State equation, computed on demand.** Each bucket stores only three numbers
  (`tokens`, `lastRefillMs`, plus the two configured constants). Tokens are
  recalculated when a request arrives using
  `T_new = min(B, T_old + r · Δt)` — there is **no `setInterval` per bucket**.
  An idle client costs a single small object and zero CPU.
- **Bounded growth.** Buckets live in a `Map` keyed by client. A single global
  sweeper (one `unref`'d interval for the whole process) evicts buckets idle
  past a TTL, so total memory is **O(active clients)**, not O(all clients ever
  seen). 10k concurrent clients ≈ a few hundred KB.
- **Concurrency-safe by construction.** Node runs JS on one thread, and the
  `refill → check → decrement` sequence contains **no `await`**, so it executes
  atomically. Concurrent bursts cannot interleave and double-spend tokens — the
  bucket "handles burst traffic smoothly" without locks.

**Trade-off:** state is in-process, so it does **not** survive a restart and is
**not shared across horizontally-scaled instances**. For a single-node prototype
this is ideal — no Redis, no network hop on the hot path. To scale out, the same
`TokenBucket` math moves behind a shared store (e.g. a Redis Lua script doing the
identical `min(B, T + r·Δt)` update atomically), keeping the algorithm while
swapping the storage substrate.

---

## Configuration

Rate limiter defaults live in `lib/rateLimiter.ts`:

```ts
const BURST_CAPACITY = 20;     // B — instantaneous burst a client may fire
const REFILL_RATE_PER_SEC = 5; // r — sustained tokens/second
```

The client flushes once per 5s, so legitimate usage sits far under the limit
while runaway loops are throttled with a `429` + `Retry-After`.
