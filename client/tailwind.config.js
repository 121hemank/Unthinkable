/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Calm clinical palette — see design guide §7.
        // Reserve amber/red ONLY for urgency badges, never for general UI.
        primary: {
          DEFAULT: "#0D9488", // teal-600
          dark: "#0F766E",
          light: "#CCFBF1",
        },
        urgency: {
          low: "#16A34A",
          medium: "#D97706",
          high: "#DC2626",
        },
      },
    },
  },
  plugins: [],
};
