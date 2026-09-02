import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx,mdx}",
    "./components/**/*.{ts,tsx,js,jsx,mdx}",
    "./features/**/*.{ts,tsx,js,jsx,mdx}",
  ],
  theme: {
    screens: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        bg: {
          0: "var(--bg-0)",
          1: "var(--bg-1)",
          2: "var(--bg-2)",
          3: "var(--bg-3)",
          4: "var(--bg-4)",
        },
        text: {
          0: "var(--text-0)",
          1: "var(--text-1)",
          2: "var(--text-2)",
          3: "var(--text-3)",
        },
        amber: {
          DEFAULT: "var(--amber)",
          bright: "var(--amber-bright)",
          deep: "var(--amber-deep)",
        },
        neon: "var(--neon)",
        gold: "var(--gold)",
        wood: "var(--wood)",
        leather: "var(--leather)",
        cream: "var(--cream)",
        ok: "var(--ok)",
        warn: "var(--warn)",
        err: "var(--err)",
        info: "var(--info)",
      },
      fontFamily: {
        display: ["var(--f-display)"],
        body: ["var(--f-body)"],
        script: ["var(--f-script)"],
        mono: ["var(--f-mono)"],
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
      },
    },
  },
  plugins: [],
};

export default config;
