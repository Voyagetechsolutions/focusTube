import Link from "next/link";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import VideoPlayer from "@/components/VideoPlayer";
import { CATALOG, getVideo } from "@/lib/catalog";

export function generateStaticParams() {
  return CATALOG.map((v) => ({ id: v.id }));
}

const TIPS = [
  {
    icon: "🗂️",
    title: "Switch tabs",
    body: "Play, then move to another tab — playback pauses (Page Visibility API).",
  },
  {
    icon: "📜",
    title: "Scroll away",
    body: "Play, then scroll until < 90% shows — it pauses (IntersectionObserver).",
  },
  {
    icon: "📡",
    title: "Watch the wire",
    body: "Batched POST /api/telemetry fires every 5s in DevTools → Network.",
  },
];

export default function WatchPage({ params }: { params: { id: string } }) {
  const video = getVideo(params.id);
  if (!video) notFound();

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-7">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-fg/50 transition hover:text-fg"
        >
          <span aria-hidden>←</span> Catalog
        </Link>

        <div className="mt-4 animate-fadeUp">
          <VideoPlayer src={video.src} videoId={video.id} poster={video.poster} />
        </div>

        <div className="mt-6 animate-fadeUp">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: video.accent }}
            />
            <span className="text-xs font-medium uppercase tracking-widest text-fg/40">
              {video.creator} · {video.durationLabel}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {video.title}
          </h1>
          <p className="mt-3 leading-relaxed text-fg/65">
            {video.description}
          </p>
        </div>

        {/* Test instructions */}
        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          {TIPS.map((t) => (
            <div
              key={t.title}
              className="rounded-2xl glass p-4 transition hover:border-fg/20"
            >
              <div className="text-xl">{t.icon}</div>
              <h2 className="mt-2 text-sm font-semibold text-fg/90">
                {t.title}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-fg/55">
                {t.body}
              </p>
            </div>
          ))}
        </section>

        {/* Tall spacer so the player can be scrolled out of the viewport. */}
        <div className="scroll-spacer mt-6 flex items-center justify-center">
          <span className="rounded-full glass px-4 py-2 text-sm text-fg/40">
            ↓ keep scrolling — the player pauses below 90% visible ↓
          </span>
        </div>
      </main>
    </>
  );
}
