import type { Config } from "tailwindcss";

// Bijlee brand system — ported 1:1 from the Racked Artifact prototype.
// Colors are CSS custom properties (see app/globals.css) so light/dark
// theming and the "always-dark" surfaces work exactly as they did there.
const config: Config = {
  darkMode: ["selector", ':root:not([data-theme="light"])'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        "ink-faint": "var(--ink-faint)",
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        yellow: "var(--yellow)",
        "yellow-ink": "var(--yellow-ink)",
        danger: "var(--danger)",
        warn: "var(--warn)",
        good: "var(--good)",
        "dark-surface": "var(--dark-surface)",
        "dark-surface-2": "var(--dark-surface-2)",
        "on-dark": "var(--on-dark)",
        "accent-on-dark": "var(--accent-on-dark)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        card: "20px",
        control: "14px",
      },
      maxWidth: {
        app: "520px",
      },
    },
  },
  plugins: [],
};
export default config;
