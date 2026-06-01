import NavBar from "@/components/NavBar";
import Dashboard from "@/components/Dashboard";

export const metadata = {
  title: "FocusTube — Analytics",
};

export default function DashboardPage() {
  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-5xl px-5 pb-20 pt-10">
        <header className="mb-8 animate-fadeUp">
          <span className="inline-flex items-center gap-2 rounded-full border border-fg/10 bg-fg/5 px-3 py-1 text-xs font-medium text-fg/70">
            <span className="h-1.5 w-1.5 animate-pulseGlow rounded-full bg-focus-accent" />
            Real-time read model
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Engagement <span className="gradient-text">analytics</span>
          </h1>
          <p className="mt-2 max-w-xl text-fg/60">
            Live signal from the focus engine. Watch a video, switch tabs or
            scroll it off-screen, and see distraction events land here.
          </p>
        </header>
        <Dashboard />
      </main>
    </>
  );
}
