import type { SkillCategory } from "./types";

export const BRAND = { name: "IELTStudy", tagline: "Adaptive IELTS learning" };

export const SKILL_META: Record<SkillCategory, { label: string; chip: string; text: string; bar: string; tint: string; letter: string }> = {
  listening: { label: "Listening", chip: "bg-skill-l-bg text-skill-l-ink", text: "text-skill-l", bar: "bg-skill-l", tint: "bg-skill-l-bg", letter: "L" },
  reading: { label: "Reading", chip: "bg-skill-r-bg text-skill-r-ink", text: "text-skill-r", bar: "bg-skill-r", tint: "bg-skill-r-bg", letter: "R" },
  writing: { label: "Writing", chip: "bg-skill-w-bg text-skill-w-ink", text: "text-skill-w", bar: "bg-skill-w", tint: "bg-skill-w-bg", letter: "W" },
  speaking: { label: "Speaking", chip: "bg-skill-s-bg text-skill-s-ink", text: "text-skill-s", bar: "bg-skill-s", tint: "bg-skill-s-bg", letter: "S" },
};
export const SKILL_HEX: Record<SkillCategory, string> = { listening: "#3971B8", reading: "#B8921F", writing: "#7F9148", speaking: "#7A6A4F" };

export const LEVEL_THEME: Record<number, { panel: string; title: string; sub: string; foot: string; badge: string; heroBg: string }> = {
  1: { panel: "bg-vanilla", title: "text-vanilla-ink", sub: "text-brand", foot: "text-vanilla-ink", badge: "bg-vanilla text-vanilla-ink", heroBg: "bg-vanilla text-ink" },
  2: { panel: "bg-brand", title: "text-white", sub: "text-white", foot: "text-white/90", badge: "bg-brand-tint text-brand-ink", heroBg: "bg-brand text-white" },
  3: { panel: "bg-ink", title: "text-white", sub: "text-white", foot: "text-white/90", badge: "bg-line/60 text-ink", heroBg: "bg-ink text-white" },
};

export const band = (b: number | undefined | null) => (b == null || isNaN(b) ? "—" : b.toFixed(1));

export function timeAgo(iso?: string) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const fmtDate = (iso?: string, withTime = false) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }) : "—";

export function mmss(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

