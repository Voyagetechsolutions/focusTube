import { NextResponse } from "next/server";
import { telemetryStore } from "@/lib/telemetryStore";
import { CATALOG } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/analytics
 * Read model for the dashboard: per-video engagement aggregates plus totals.
 * Videos with no telemetry yet are included with zeroed stats so the dashboard
 * lists the whole catalog.
 */
export async function GET(): Promise<NextResponse> {
  const recorded = new Map(
    telemetryStore.allStats().map((s) => [s.videoId, s])
  );

  const videos = CATALOG.map((v) => {
    const s = recorded.get(v.id);
    return {
      videoId: v.id,
      title: v.title,
      creator: v.creator,
      poster: v.poster,
      sessions: s?.sessions ?? 0,
      totalWatchedSec: s?.totalWatchedSec ?? 0,
      plays: s?.plays ?? 0,
      pauses: s?.pauses ?? 0,
      completions: s?.completions ?? 0,
      visibilityLosses: s?.visibilityLosses ?? 0,
      intersectionDrops: s?.intersectionDrops ?? 0,
      focusScore: s?.focusScore ?? 0,
      lastEventTs: s?.lastEventTs ?? 0,
    };
  }).sort((a, b) => b.lastEventTs - a.lastEventTs);

  const totals = videos.reduce(
    (acc, v) => {
      acc.sessions += v.sessions;
      acc.totalWatchedSec += v.totalWatchedSec;
      acc.visibilityLosses += v.visibilityLosses;
      acc.intersectionDrops += v.intersectionDrops;
      return acc;
    },
    { sessions: 0, totalWatchedSec: 0, visibilityLosses: 0, intersectionDrops: 0 }
  );

  return NextResponse.json(
    { totals, videos, generatedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
