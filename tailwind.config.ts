import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // Brand: indigo-violet. Actions, identity, current selection.
        brand: {
          50: "#f2f1fd",
          100: "#e7e4fb",
          200: "#d1ccf7",
          300: "#b1a6f0",
          400: "#8d7ce7",
          500: "#6f57db",
          600: "#5a3fca",
          700: "#4a33a6",
          800: "#3e2c86",
          900: "#35276b",
        },
      },
      boxShadow: {
        // Soft, low, product-grade elevation. Not a drop-shadow slab.
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        "card-hover":
          "0 2px 4px -1px rgb(15 23 42 / 0.06), 0 6px 16px -4px rgb(15 23 42 / 0.10)",
      },
    },
  },
  plugins: [],
} satisfies Config;
