import Link from "next/link";
import NavBar from "@/components/NavBar";
import { CATALOG } from "@/lib/catalog";

export default function Home() {
  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-10">
        {/* Hero */}
        <header className="animate-fadeUp relative overflow-hidden rounded-3xl glass px-7 py-12 sm:px-12 sm:py-16">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-focus-accent/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-focus-accent2/20 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-fg/10 bg-fg/5 px-3 py-1 text-xs font-medium text-fg/70">
              <span className="h-1.5 w-1.5 animate-pulseGlow rounded-full bg-focus-ok" />
              Native focus engine · no iframes
            </span>
            <h1 className="mt-5 max-w-2xl text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Video that <span className="gradient-text">demands your focus</span>.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-fg/60">
              Every clip pauses the instant your attention drifts — switch tabs
              or scroll it out of view and it stops. Engagement streams live to
              the{" "}
              <Link
                href="/dashboard"
                className="font-medium text-focus-accent hover:underline"
              >
                analytics dashboard
              </Link>
              .
            </p>
          </div>
        </header>

        {/* Catalog */}
        <h2 className="mb-5 mt-12 text-sm font-semibold uppercase tracking-widest text-fg/40">
          Catalog
        </h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CATALOG.map((v, i) => (
            <Link
              key={v.id}
              href={`/watch/${v.id}`}
              style={{ animationDelay: `${i * 70}ms` }}
              className="group animate-fadeUp overflow-hidden rounded-2xl border border-fg/10 bg-surface2 shadow-card transition duration-300 hover:-translate-y-1 hover:border-fg/20 hover:shadow-glow"
            >
              <div
                className="relative flex aspect-video items-center justify-center overflow-hidden"
                style={{
                  background: `radial-gradient(120% 120% at 20% 0%, ${v.accent}40, transparent 55%), linear-gradient(160deg, ${v.accent}22, #0b0d16 75%)`,
                }}
              >
                {/* Big translucent initial as artwork */}
                <span
                  className="select-none text-7xl font-black opacity-30 transition duration-500 group-hover:scale-110 group-hover:opacity-50"
                  style={{ color: v.accent }}
                >
                  {v.title.charAt(0)}
                </span>
                {/* Play affordance */}
                <span className="absolute inset-0 grid place-items-center opacity-0 transition duration-300 group-hover:opacity-100">
                  <span
                    className="grid h-14 w-14 place-items-center rounded-full text-black shadow-glow backdrop-blur"
                    style={{ background: v.accent }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </span>
                <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white/85 backdrop-blur">
                  {v.durationLabel}
                </span>
              </div>
              <div className="p-4">
                <h3 className="font-semibold leading-tight">{v.title}</h3>
                <p className="mt-0.5 text-xs font-medium text-fg/40">
                  {v.creator}
                </p>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-fg/55">
                  {v.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
