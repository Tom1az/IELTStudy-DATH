import type { Config } from "tailwindcss";

// Design tokens sampled from the team's Figma file (DATH_G18_figma).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: { DEFAULT: "1rem", md: "2rem" }, screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1344px" } },
    extend: {
      colors: {
        cream: "#FAF7F0",
        sand: { DEFAULT: "#F1EADA", dark: "#E6DCC6" },
        line: "#E8E2D6",
        navy: { DEFAULT: "#1B2A41", 700: "#24354F", 600: "#3A4B65", 300: "#C7D0DF" },
        ink: { DEFAULT: "#1B2A41", muted: "#4F5B6E", soft: "#6B7587" },
        brand: { DEFAULT: "#C3410D", hover: "#A93709", soft: "#F4A682", tint: "#FBE4D6" },
        teal: { DEFAULT: "#0E5C5C", tint: "#DCEFEE", ink: "#084D4A" },
        peach: { DEFAULT: "#FBE4D6", ink: "#7A2E12" },
        skill: {
          l: "#0E5C5C", "l-bg": "#DCEFEE", "l-ink": "#0E5C5C",
          r: "#B67920", "r-bg": "#FBE9C5", "r-ink": "#6E4704",
          w: "#C3410D", "w-bg": "#F9D8CF", "w-ink": "#97361A",
          s: "#6B50BB", "s-bg": "#E3DEF5", "s-ink": "#4A3790",
        },
        success: "#0E5C5C",
        danger: "#B42318",
      },
      fontFamily: {
        serif: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
      boxShadow: { card: "0 1px 2px rgba(27,42,65,0.04)" },
      letterSpacing: { eyebrow: "0.12em" },
    },
  },
  plugins: [],
};
export default config;
