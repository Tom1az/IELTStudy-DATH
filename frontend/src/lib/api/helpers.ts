import type { Course, Enrollment, Lesson, PracticeSet, Question, SkillCategory, UserRecord } from "@/lib/types";
import { SKILL_CATEGORIES } from "@/lib/types";
import { initialMastery } from "@/lib/adaptive/bkt";
import { db } from "./mock-db";

export function masteryMap(userId: string): Record<string, number> {
  const d = db();
  const map: Record<string, number> = Object.fromEntries(d.skills.map((s) => [s.id, initialMastery(s.id)]));
  for (const m of d.mastery) if (m.userId === userId) map[m.skillId] = m.masteryProb;
  return map;
}

export function saveMastery(userId: string, next: Record<string, number>, touched: string[]) {
  const d = db();
  const now = new Date().toISOString();
  for (const skillId of touched) {
    const row = d.mastery.find((m) => m.userId === userId && m.skillId === skillId);
    if (row) {
      row.masteryProb = next[skillId];
      row.attempts += 1;
      row.updatedAt = now;
    } else d.mastery.push({ userId, skillId, masteryProb: next[skillId], attempts: 1, updatedAt: now });
  }
}

export const courseById = (id: string) => db().courses.find((c) => c.id === id);
export const courseBySlug = (slug: string) => db().courses.find((c) => c.slug === slug);

export function lessonsOf(courseId: string, includeHidden = false): Lesson[] {
  return db()
    .lessons.filter((l) => l.courseId === courseId && (includeHidden || l.status === "published"))
    .sort((a, b) => SKILL_CATEGORIES.indexOf(a.skill) - SKILL_CATEGORIES.indexOf(b.skill) || a.order - b.order);
}

export function skillCounts(lessons: Lesson[]) {
  return Object.fromEntries(SKILL_CATEGORIES.map((s) => [s, lessons.filter((l) => l.skill === s).length])) as Record<SkillCategory, number>;
}

export function enrollmentOf(userId: string, courseId: string): Enrollment | undefined {
  return db().enrollments.find((e) => e.userId === userId && e.courseId === courseId && e.status !== "left");
}

export function setOf(id: string): PracticeSet | undefined {
  return db().practiceSets.find((s) => s.id === id);
}

/** Strip answer keys and explanations before a set is sent to a learner who is taking it. */
export function publicQuestion(q: Question): Question {
  return { ...q, answerKey: "", explanation: "" };
}

export function canManageCourse(u: UserRecord, c: Course) {
  return u.role === "admin" || (u.role === "instructor" && c.instructorId === u.id);
}

/** Lessons must be followed in order inside each skill track. */
export function isLessonUnlocked(lesson: Lesson, enrollment: Enrollment | undefined): boolean {
  if (!enrollment) return lesson.freePreview;
  const prev = lessonsOf(lesson.courseId).filter((l) => l.skill === lesson.skill && l.order < lesson.order);
  return prev.every((l) => enrollment.completedLessonIds.includes(l.id));
}

export function progressOf(e: Enrollment) {
  const total = lessonsOf(e.courseId).length;
  const done = e.completedLessonIds.filter((id) => db().lessons.some((l) => l.id === id && l.status === "published")).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

export function perSkillProgress(e: Enrollment) {
  const ls = lessonsOf(e.courseId);
  return SKILL_CATEGORIES.map((skill) => {
    const of = ls.filter((l) => l.skill === skill);
    return { skill, done: of.filter((l) => e.completedLessonIds.includes(l.id)).length, total: of.length };
  }).filter((x) => x.total > 0);
}

/** Has the learner met the course prerequisite (lower level completed or a placement band)? */
export function prerequisiteMet(u: UserRecord, c: Course): { ok: boolean; reason?: string } {
  if (c.level === 1 || c.prerequisiteBand === undefined) return { ok: true };
  const lower = db().courses.filter((x) => x.level === c.level - 1 && x.status === "published");
  const completedLower = db().enrollments.some((e) => e.userId === u.id && e.status === "completed" && lower.some((l) => l.id === e.courseId));
  if (completedLower) return { ok: true };
  if ((u.placementBand ?? 0) >= c.prerequisiteBand) return { ok: true };
  return { ok: false, reason: `${c.prerequisiteText}. ${u.placementDone ? `Your placement estimate is Band ${u.placementBand?.toFixed(1)}.` : "Take the placement quiz to check your level."}` };
}
