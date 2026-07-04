import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // Sora — headings / display / key numbers (DESIGN_STYLE.md).
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "sans-serif"],
        // IBM Plex Mono — scores, percentages, ranks (tabular numerals).
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Brand = dark navy (DESIGN_STYLE.md #1B2130). Primary actions, identity,
        // current selection. Gold is the deliberate accent, kept separate below.
        brand: {
          50: "#f4f4f2",
          100: "#e6e7e9",
          200: "#c8cad1",
          300: "#a0a4ae",
          400: "#5f6675",
          500: "#333a4a",
          600: "#1b2130",
          700: "#151a26",
          800: "#0f131c",
          900: "#090c12",
        },
        // Warm gold accent — used sparingly (DESIGN_STYLE.md #E3A82B).
        accent: {
          50: "#fdf7ea",
          100: "#faedcb",
          200: "#f3d894",
          300: "#ecc35d",
          400: "#e6b33e",
          500: "#e3a82b",
          600: "#c58c1f",
          700: "#9c6c1b",
          800: "#7d561c",
          900: "#68471a",
        },
        // Semantic tokens (muted, not alarm-toned — the "don't embarrass" principle
        // extends to color).
        success: "#3F8F5F",
        error: "#C1473A",
        info: "#3E6FA0",
        // Soft warm grey border/divider.
        line: "#E3E1DB",
      },
      boxShadow: {
        // Soft, low, product-grade elevation. Not a drop-shadow slab.
        card: "0 1px 2px 0 rgb(27 33 48 / 0.04), 0 1px 3px 0 rgb(27 33 48 / 0.06)",
        "card-hover":
          "0 2px 4px -1px rgb(27 33 48 / 0.06), 0 6px 16px -4px rgb(27 33 48 / 0.10)",
      },
    },
  },
  plugins: [],
} satisfies Config;
