import type { Course, Enrollment, Lesson, PracticeSet, Recommendation, Skill, SkillCategory } from "@/lib/types";
import { MASTERY_THRESHOLD, initialMastery } from "./bkt";

/**
 * Hybrid recommender (proposal §4): BKT mastery estimates feed a content-based
 * filter. Each lesson is a vector over micro-skills (first tag weight 1, others
 * 0.6). The learner's "need" vector is max(0, threshold − mastery). A lesson's
 * score is need·lesson / ‖lesson‖, plus a small bonus for the next lesson in
 * sequence so the path still moves forward.
 */

export interface RecommendInput {
  mastery: Record<string, number>;
  skills: Skill[];
  courses: Course[];
  lessons: Lesson[];
  sets: PracticeSet[];
  enrollments: Enrollment[];
  threshold?: number;
  k?: number;
}

const FRONTIER_BONUS = 0.1;
const SKILL_ORDER: SkillCategory[] = ["listening", "reading", "writing", "speaking"];

export function lessonVector(l: Lesson): Record<string, number> {
  return Object.fromEntries(l.skillIds.map((s, i) => [s, i === 0 ? 1 : 0.6]));
}

export function needVector(mastery: Record<string, number>, skills: Skill[], threshold = MASTERY_THRESHOLD) {
  return Object.fromEntries(skills.map((s) => [s.id, Math.max(0, threshold - (mastery[s.id] ?? initialMastery(s.id)))]));
}

export function contentScore(need: Record<string, number>, vec: Record<string, number>) {
  let dot = 0;
  let norm = 0;
  for (const [k, w] of Object.entries(vec)) {
    dot += (need[k] ?? 0) * w;
    norm += w * w;
  }
  return norm ? dot / Math.sqrt(norm) : 0;
}

/** Next not-yet-completed lesson in each skill track of a course. */
export function frontier(courseLessons: Lesson[], completed: Set<string>): Lesson[] {
  const out: Lesson[] = [];
  for (const skill of SKILL_ORDER) {
    const next = courseLessons.filter((l) => l.skill === skill && l.status === "published").sort((a, b) => a.order - b.order).find((l) => !completed.has(l.id));
    if (next) out.push(next);
  }
  return out;
}

function weakestSkill(l: Lesson, mastery: Record<string, number>) {
  return [...l.skillIds].sort((a, b) => (mastery[a] ?? initialMastery(a)) - (mastery[b] ?? initialMastery(b)))[0];
}

function reasonFor(l: Lesson, mastery: Record<string, number>, skills: Skill[], threshold: number, isFrontier: boolean) {
  const sid = weakestSkill(l, mastery);
  const p = mastery[sid] ?? initialMastery(sid);
  const name = skills.find((s) => s.id === sid)?.name ?? sid;
  if (p < threshold) return { text: `Recommended because mastery on '${name}' is ${p.toFixed(2)}, below ${threshold.toFixed(2)}.`, sid, p };
  if (isFrontier) return { text: "Next lesson in your path.", sid, p };
  return { text: `Keeps '${name}' above ${threshold.toFixed(2)}.`, sid, p };
}

/**
 * Dashboard "Up next": ranks the frontier and completed lessons of the learner's
 * active course(s). An unfinished lesson is recommended as a lesson; a finished one
 * as a re-practice. The learner's current lesson is followed by its practice set.
 */
export function recommendNext(input: RecommendInput): Recommendation[] {
  const { mastery, skills, courses, lessons, sets, enrollments } = input;
  const threshold = input.threshold ?? MASTERY_THRESHOLD;
  const k = input.k ?? 3;
  const need = needVector(mastery, skills, threshold);
  const active = enrollments.filter((e) => e.status === "active");
  const scored: { l: Lesson; score: number; isFrontier: boolean; done: boolean; course: Course; current: boolean }[] = [];

  for (const e of active) {
    const course = courses.find((c) => c.id === e.courseId);
    if (!course) continue;
    const cl = lessons.filter((l) => l.courseId === course.id && l.status === "published");
    const done = new Set(e.completedLessonIds);
    const front = new Set(frontier(cl, done).map((l) => l.id));
    for (const l of cl) {
      const isFrontier = front.has(l.id);
      if (!isFrontier && !done.has(l.id)) continue; // locked ahead of the frontier
      const score = contentScore(need, lessonVector(l)) + (isFrontier ? FRONTIER_BONUS : 0);
      scored.push({ l, score, isFrontier, done: done.has(l.id), course, current: e.lastLessonId === l.id && !done.has(l.id) });
    }
  }

  scored.sort((a, b) => b.score - a.score || Number(b.current) - Number(a.current));
  const out: Recommendation[] = [];
  for (const s of scored) {
    if (out.length >= k) break;
    const { text, sid, p } = reasonFor(s.l, mastery, skills, threshold, s.isFrontier);
    const set = sets.find((x) => x.id === s.l.practiceSetId);
    if (!s.done) {
      out.push({ id: `rec-l-${s.l.id}`, kind: "lesson", targetId: s.l.id, courseSlug: s.course.slug, title: s.l.title, skill: s.l.skill, minutes: s.l.videoMinutes, score: round(s.score), reason: text, skillId: sid, mastery: p, source: p < threshold ? "remediation" : "sequence" });
      if (set && (s.current || out.length === 1) && out.length < k) {
        out.push({ id: `rec-p-${set.id}`, kind: "practice", targetId: set.id, courseSlug: s.course.slug, title: `Practice set ${set.code}`, skill: set.skill, minutes: set.minutes, score: round(s.score), reason: `Practise '${s.l.title}' right after the lesson.`, skillId: sid, mastery: p, source: "sequence" });
      }
    } else if (set) {
      out.push({ id: `rec-p-${set.id}`, kind: "practice", targetId: set.id, courseSlug: s.course.slug, title: `Practice set ${set.code} · ${set.title}`, skill: set.skill, minutes: set.minutes, score: round(s.score), reason: text, skillId: sid, mastery: p, source: "remediation" });
    }
  }
  return out.slice(0, k);
}

/**
 * Post-quiz remediation: for each skill the quiz tested that is now below the
 * threshold, find review lessons (any published course, preferring the learner's
 * level or below) and their practice sets, excluding the set just taken.
 */
export function recommendRemediation(input: RecommendInput & { testedSkillIds: string[]; excludeSetId?: string; currentLevel?: number }): Recommendation[] {
  const { mastery, skills, courses, lessons, sets, testedSkillIds, excludeSetId } = input;
  const threshold = input.threshold ?? MASTERY_THRESHOLD;
  const k = input.k ?? 3;
  const weak = testedSkillIds.filter((s) => (mastery[s] ?? initialMastery(s)) < threshold).sort((a, b) => (mastery[a] ?? 0) - (mastery[b] ?? 0));
  if (!weak.length) return [];
  const need: Record<string, number> = Object.fromEntries(weak.map((s) => [s, threshold - (mastery[s] ?? initialMastery(s))]));
  const published = new Map(courses.filter((c) => c.status === "published").map((c) => [c.id, c]));
  const level = input.currentLevel ?? 2;
  const enrolledIds = new Set(input.enrollments.map((e) => e.courseId));

  const ranked = lessons
    .filter((l) => published.has(l.courseId) && l.status === "published" && l.practiceSetId !== excludeSetId)
    .map((l) => {
      const c = published.get(l.courseId)!;
      const levelFit = c.level <= level ? 0.05 * (1 - (level - c.level) * 0.5) : -0.2;
      const access = enrolledIds.has(c.id) || l.freePreview ? 0.05 : -0.1;
      const cs = contentScore(need, lessonVector(l));
      return { l, c, cs, score: cs + levelFit + access };
    })
    .filter((x) => x.cs > 0.01)
    .sort((a, b) => b.score - a.score);

  const out: Recommendation[] = [];
  const usedSkill = new Map<string, number>();
  for (const { l, c, score } of ranked) {
    if (out.length >= k) break;
    const focus = weak.find((w) => l.skillIds.includes(w)) ?? weakestSkill(l, mastery);
    if ((usedSkill.get(focus) ?? 0) >= 2) continue; // diversify across weak skills
    usedSkill.set(focus, (usedSkill.get(focus) ?? 0) + 1);
    const p = mastery[focus] ?? initialMastery(focus);
    const name = skills.find((s) => s.id === focus)?.name ?? focus;
    const reason = `Recommended because mastery on '${name}' is ${p.toFixed(2)}, below ${threshold.toFixed(2)}.`;
    const set = sets.find((s) => s.id === l.practiceSetId);
    const enrolled = enrolledIds.has(c.id);
    if (enrolled && set && !out.some((o) => o.kind === "lesson" && o.skillId === focus)) {
      out.push({ id: `rem-l-${l.id}`, kind: "lesson", targetId: l.id, courseSlug: c.slug, title: `${c.levelName}: ${l.title}`, skill: l.skill, minutes: l.videoMinutes, score: round(score), reason, skillId: focus, mastery: p, source: "remediation" });
    } else if (set && (enrolled || l.freePreview)) {
      out.push({ id: `rem-p-${set.id}`, kind: "practice", targetId: set.id, courseSlug: c.slug, title: `${c.levelName} practice ${set.code} · ${set.title}`, skill: set.skill, minutes: set.minutes, score: round(score), reason, skillId: focus, mastery: p, source: "remediation" });
    }
  }
  return out;
}

/** Popularity baseline (proposal evaluation): most-completed lessons first. */
export function recommendPopular(lessons: Lesson[], enrollments: Enrollment[], completed: Set<string>, k = 3): Lesson[] {
  const counts = new Map<string, number>();
  for (const e of enrollments) for (const id of e.completedLessonIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return lessons.filter((l) => !completed.has(l.id)).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)).slice(0, k);
}

const round = (v: number) => Math.round(v * 1000) / 1000;
