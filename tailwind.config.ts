import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic surface/text tokens, bound to CSS variables so they flip
        // between the dark (default) and light themes. Use with Tailwind's
        // alpha syntax, e.g. text-fg/60, border-fg/10, bg-fg/5.
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        surface2: "rgb(var(--surface-2) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        focus: {
          accent: "#6c8cff",
          accent2: "#a472ff",
          ok: "#21c08a",
          warn: "#f59e2c",
          danger: "#f0455a",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(108,140,255,0.25), 0 12px 40px -12px rgba(108,140,255,0.45)",
        card: "0 18px 50px -24px rgba(0,0,0,0.55)",
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(120deg, #6c8cff 0%, #a472ff 50%, #4cd6c8 100%)",
        "panel-gradient":
          "linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01))",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulseGlow: {
          "0%,100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        fadeUp: "fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both",
        floaty: "floaty 6s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
        pulseGlow: "pulseGlow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
