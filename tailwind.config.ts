import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bastet: {
          bg: "#0A0F1C",
          card: "#0F1729",
          border: "#1E2D44",
          gold: "#22D3EE",
          "gold-hover": "#67E8F9",
          "gold-muted": "rgba(34, 211, 238, 0.12)",
        },
        text: {
          primary: "#f1f5f9",
          secondary: "#CBD5E1",
          muted: "#64748B",
        },
        status: {
          success: "#34D399",
          warning: "#FBBF24",
          error: "#F87171",
          info: "#22D3EE",
        },
        navy: {
          950: "#0A0F1C",
          900: "#0F1729",
          800: "#162033",
          700: "#1E2D44",
          600: "#2A3F5F",
        },
        cyan: {
          300: "#67E8F9",
          400: "#22D3EE",
          500: "#06B6D4",
        },
        emerald: {
          400: "#34D399",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
