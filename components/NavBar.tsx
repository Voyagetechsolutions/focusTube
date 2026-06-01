"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const links = [
  { href: "/", label: "Catalog" },
  { href: "/dashboard", label: "Analytics" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-20 border-b border-fg/5 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-gradient shadow-glow">
            <span className="h-2.5 w-2.5 rounded-full bg-fg/90" />
          </span>
          <span className="text-lg font-bold tracking-tight">
            Focus<span className="gradient-text">Tube</span>
          </span>
        </Link>

        <div className="flex items-center gap-1.5 text-sm">
          {links.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3.5 py-1.5 font-medium transition ${
                  active
                    ? "bg-fg/10 text-fg shadow-glow"
                    : "text-fg/55 hover:bg-fg/5 hover:text-fg"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
