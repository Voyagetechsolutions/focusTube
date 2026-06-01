import { NextRequest, NextResponse } from "next/server";
import { gunzipSync } from "node:zlib";
import { telemetryRateLimiter } from "@/lib/rateLimiter";
import { telemetryStore } from "@/lib/telemetryStore";
import type { TelemetryBatch } from "@/lib/telemetryTypes";

// Force the Node.js runtime: we use node:zlib to inflate gzip bodies, and the
// in-memory rate limiter must live in a long-lived server process.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Best-effort client key for the bucket: first XFF hop, else a fallback. */
function clientKey(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "anonymous";
}

/** Read the raw body, transparently gunzipping when the client compressed it. */
async function readBody(req: NextRequest): Promise<string> {
  const raw = Buffer.from(await req.arrayBuffer());
  const encoding = req.headers.get("content-encoding");
  const type = req.headers.get("content-type") ?? "";
  const looksGzipped =
    encoding?.includes("gzip") || type.includes("application/gzip");
  if (looksGzipped && raw.length > 0) {
    return gunzipSync(raw).toString("utf8");
  }
  return raw.toString("utf8");
}

function isValidBatch(value: unknown): value is TelemetryBatch {
  if (typeof value !== "object" || value === null) return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.sessionId === "string" &&
    typeof b.videoId === "string" &&
    typeof b.sentAt === "number" &&
    Array.isArray(b.events)
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // --- Token-bucket rate limit (custom, no third-party middleware) ----------
  const key = clientKey(req);
  const decision = telemetryRateLimiter.consume(key);

  const limitHeaders: Record<string, string> = {
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
  };

  if (!decision.allowed) {
    return new NextResponse(
      JSON.stringify({ error: "Too Many Requests" }),
      {
        status: 429,
        headers: {
          ...limitHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(decision.retryAfterSec),
        },
      }
    );
  }

  // --- Parse + validate -----------------------------------------------------
  let batch: TelemetryBatch;
  try {
    const text = await readBody(req);
    const parsed: unknown = JSON.parse(text);
    if (!isValidBatch(parsed)) {
      return NextResponse.json(
        { error: "Malformed telemetry batch" },
        { status: 422, headers: limitHeaders }
      );
    }
    batch = parsed;
  } catch {
    return NextResponse.json(
      { error: "Unreadable body (bad gzip or JSON)" },
      { status: 400, headers: limitHeaders }
    );
  }

  // --- Ingest ---------------------------------------------------------------
  // Fold the batch into the in-memory read model that powers /dashboard, and
  // log a compact summary so you can see batches landing in the server console.
  telemetryStore.record(batch);
  const skewMs = Date.now() - batch.sentAt;
  // eslint-disable-next-line no-console
  console.log(
    `[telemetry] session=${batch.sessionId.slice(0, 8)} video=${batch.videoId} ` +
      `events=${batch.events.length} skew=${skewMs}ms ` +
      `types=${batch.events.map((e) => e.type).join(",")}`
  );

  // 204 keeps the response body empty — ideal for sendBeacon and fetch alike.
  return new NextResponse(null, { status: 204, headers: limitHeaders });
}

// Reject other verbs explicitly so probes get a clean answer.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } }
  );
}
