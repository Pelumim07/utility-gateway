/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0A0B0D",
        surface: "#14161A",
        "surface-raised": "#1B1E23",
        accent: "#00FFAA",
        "accent-dim": "#00CC88",
        "text-primary": "#F2F3F0",
        "text-secondary": "#8B9098",
        border: "#2A2D33",
        danger: "#FF5C5C",
        warning: "#FFB454",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'IBM Plex Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
