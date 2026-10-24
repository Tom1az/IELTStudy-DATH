import type { SkillCategory } from "./types";

export const BRAND = { name: "IELTStudy", tagline: "Adaptive IELTS learning" };

export const SKILL_META: Record<SkillCategory, { label: string; chip: string; text: string; bar: string; tint: string; letter: string }> = {
  listening: { label: "Listening", chip: "bg-skill-l-bg text-skill-l-ink", text: "text-skill-l", bar: "bg-skill-l", tint: "bg-skill-l-bg", letter: "L" },
  reading: { label: "Reading", chip: "bg-skill-r-bg text-skill-r-ink", text: "text-skill-r", bar: "bg-skill-r", tint: "bg-skill-r-bg", letter: "R" },
  writing: { label: "Writing", chip: "bg-skill-w-bg text-skill-w-ink", text: "text-skill-w", bar: "bg-skill-w", tint: "bg-skill-w-bg", letter: "W" },
  speaking: { label: "Speaking", chip: "bg-skill-s-bg text-skill-s-ink", text: "text-skill-s", bar: "bg-skill-s", tint: "bg-skill-s-bg", letter: "S" },
};
export const SKILL_HEX: Record<SkillCategory, string> = { listening: "#0E5C5C", reading: "#B67920", writing: "#C3410D", speaking: "#6B50BB" };

export const LEVEL_THEME: Record<number, { panel: string; title: string; sub: string; foot: string; badge: string; heroBg: string }> = {
  1: { panel: "bg-peach", title: "text-peach-ink", sub: "text-brand", foot: "text-peach-ink", badge: "bg-peach text-peach-ink", heroBg: "bg-peach text-navy" },
  2: { panel: "bg-teal", title: "text-white", sub: "text-white", foot: "text-white/90", badge: "bg-teal-tint text-teal-ink", heroBg: "bg-teal text-white" },
  3: { panel: "bg-navy", title: "text-white", sub: "text-white", foot: "text-white/90", badge: "bg-navy-300/70 text-navy", heroBg: "bg-navy text-white" },
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

export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function dueIn(iso: string) {
  const ms = Date.parse(iso) - Date.now();
  if (ms < 0) return "overdue";
  const days = Math.floor(ms / 86400000);
  if (days === 0) return "due today";
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** Figma shows the level name for the three core courses; any other course shows its own title. */
export const courseHeading = (c: { title: string; levelName: string }) => (c.title === `IELTS ${c.levelName}` ? c.levelName : c.title);
export const isCoreCourse = (c: { title: string; levelName: string }) => c.title === `IELTS ${c.levelName}`;
