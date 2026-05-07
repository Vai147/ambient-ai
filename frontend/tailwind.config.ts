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
        // Clinical dark luxury palette
        surface: {
          DEFAULT: "oklch(14% 0.01 250)",
          elevated: "oklch(18% 0.01 250)",
          overlay: "oklch(22% 0.015 250)",
        },
        accent: {
          DEFAULT: "oklch(70% 0.18 195)",
          subtle: "oklch(70% 0.18 195 / 0.15)",
        },
        warning: {
          DEFAULT: "oklch(78% 0.19 75)",
          subtle: "oklch(78% 0.19 75 / 0.15)",
        },
        success: {
          DEFAULT: "oklch(72% 0.18 155)",
          subtle: "oklch(72% 0.18 155 / 0.15)",
        },
        text: {
          primary: "oklch(96% 0.005 250)",
          secondary: "oklch(65% 0.01 250)",
          muted: "oklch(45% 0.01 250)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "8px",
        md: "10px",
        lg: "14px",
        xl: "20px",
      },
    },
  },
  plugins: [],
};

export default config;
