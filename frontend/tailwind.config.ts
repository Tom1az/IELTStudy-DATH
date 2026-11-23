import type { Config } from "tailwindcss";

// Design tokens from the team's Figma file "DATH" and the agreed palette:
// Celtic Blue #3971B8 (primary), Ivory #FBFCEE (page), Drab Dark Brown #343B1B (text),
// Vanilla #F6E6A5 (accent cards) and Tea Green #C8D69B (used sparingly, by choice).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: { DEFAULT: "1rem", md: "2rem" }, screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1344px" } },
    extend: {
      colors: {
        ivory: "#FBFCEE",
        line: "#E0E5D4",
        ink: { DEFAULT: "#343B1B", muted: "#626950", soft: "#858B72" },
        brand: { DEFAULT: "#3971B8", hover: "#2E5E9C", tint: "#F2F6FC", soft: "#A9C4E6", ink: "#24497A" },
        vanilla: { DEFAULT: "#F6E6A5", track: "#DFD39E", ink: "#5C4A0E" },
        tea: { DEFAULT: "#C8D69B", ink: "#343B1B" },
        skill: {
          l: "#3971B8", "l-bg": "#E3ECF7", "l-ink": "#24497A",
          r: "#B8921F", "r-bg": "#F6E6A5", "r-ink": "#5C4A0E",
          w: "#7F9148", "w-bg": "#E6EDCF", "w-ink": "#46521F",
          s: "#7A6A4F", "s-bg": "#ECE7DC", "s-ink": "#4B3F2A",
        },
        // "Correct" uses the primary blue so the UI needs no green
        success: { DEFAULT: "#3971B8", tint: "#E3ECF7" },
        danger: { DEFAULT: "#B42318", tint: "#FDECEA" },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "12px", "2xl": "16px" },
      boxShadow: {
        card: "0 1px 2px rgba(52,59,27,0.04)",
        // Used on hover/open states only, so a raised surface reads as raised
        lift: "0 10px 24px -14px rgba(52,59,27,0.35)",
        pop: "0 18px 40px -20px rgba(52,59,27,0.45)",
      },
      letterSpacing: { eyebrow: "0.08em" },
      // One easing for everything that moves: decelerating, no overshoot except on toasts
      transitionTimingFunction: { swift: "cubic-bezier(0.22,0.61,0.36,1)" },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
        // Dialogs: a sheet sliding up on phones, a small zoom on wider screens
        sheet: { from: { opacity: "0", transform: "translateY(16px) scale(0.98)" }, to: { opacity: "1", transform: "none" } },
        toast: { from: { opacity: "0", transform: "translateY(14px) scale(0.96)" }, to: { opacity: "1", transform: "none" } },
        // The navigation drawer on phones
        drawer: { from: { transform: "translateX(-100%)" }, to: { transform: "none" } },
        // The sweep across a loading placeholder
        shimmer: { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(100%)" } },
      },
      animation: {
        rise: "rise 0.42s cubic-bezier(0.22,0.61,0.36,1) both",
        fade: "fade 0.25s ease-out both",
        sheet: "sheet 0.26s cubic-bezier(0.22,0.61,0.36,1) both",
        toast: "toast 0.3s cubic-bezier(0.2,1.1,0.4,1) both",
        drawer: "drawer 0.24s cubic-bezier(0.22,0.61,0.36,1) both",
        shimmer: "shimmer 1.7s infinite",
      },
    },
  },
  plugins: [],
};
export default config;
