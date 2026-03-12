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
          bg: "#0d1117",
          card: "#12121f",
          border: "#1e293b",
          gold: "#c9a84c",
          "gold-hover": "#d4b85c",
          "gold-muted": "rgba(201, 168, 76, 0.15)",
        },
        text: {
          primary: "#f1f5f9",
          secondary: "#94a3b8",
          muted: "#64748b",
        },
        status: {
          success: "#22c55e",
          warning: "#f59e0b",
          error: "#ef4444",
          info: "#3b82f6",
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
