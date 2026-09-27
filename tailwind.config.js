/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
        accent: {
          400: "#bef264",
          500: "#a3e635",
          600: "#84cc16",
        },
        surface: {
          50:  "#f8fafc",
          100: "#f1f5f9",
        },
        default: "#111827",
        muted:   "#6b7280",
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
        10: ["10px", { lineHeight: "14px" }],
        11: ["11px", { lineHeight: "15px" }],
        12: ["12px", { lineHeight: "16px" }],
        13: ["13px", { lineHeight: "18px" }],
        14: ["14px", { lineHeight: "20px" }],
        15: ["15px", { lineHeight: "21px" }],
        16: ["16px", { lineHeight: "22px" }],
        18: ["18px", { lineHeight: "24px" }],
        20: ["20px", { lineHeight: "26px" }],
        24: ["24px", { lineHeight: "30px" }],
      },
    },
  },
  plugins: [],
}
