import type { Course, PracticeSet, QuizAttempt, Recommendation, RemediationGate, Skill, SkillCategory } from "@/lib/types";
import { SKILL_CATEGORIES } from "@/lib/types";
import { MASTERY_THRESHOLD, applyResponse, bandsBySkill, isCorrect, initialMastery, recommendedLevelForBand, categoryMastery } from "@/lib/adaptive/bkt";
import { recommendRemediation } from "@/lib/adaptive/recommender";
import { ApiError, qs, request } from "./client";
import { commit, db, notify, nowIso, requireUser, uid } from "./mock-db";
import { courseById, enrollmentOf, isLessonUnlocked, lessonsOf, masteryMap, publicQuestion, saveMastery, setOf } from "./helpers";

export interface AttemptSession {
  set: PracticeSet; // answer keys stripped
  attempt: QuizAttempt;
  course: Course | null;
  lessonTitle?: string;
}

export interface SkillChange {
  skillId: string;
  name: string;
  category: SkillCategory;
  before: number;
  after: number;
}

export interface AttemptResult {
  attempt: QuizAttempt;
  set: PracticeSet; // with answers and explanations
  course: Course | null;
  changes: SkillChange[];
  bands: Record<SkillCategory, number>;
  overall: number;
  recommendations: Recommendation[];
  recLatencyMs: number;
  gate: (RemediationGate & { skillName: string; beforeLessonTitle: string }) | null;
  nextLesson?: { id: string; title: string; courseSlug: string };
}

export interface PracticeListItem {
  set: Pick<PracticeSet, "id" | "code" | "title" | "skill" | "minutes"> & { questions: number };
  course: Pick<Course, "id" | "slug" | "levelName" | "level">;
  lessonId: string;
  lessonTitle: string;
  unlocked: boolean;
  attempts: number;
  best: number | null;
  last: { score: number; max: number; at: string; attemptId: string } | null;
  inProgress: boolean;
}

export interface PlacementResult {
  bands: Record<SkillCategory, number>;
  overall: number;
  recommendedLevel: 1 | 2 | 3;
  recommendedCourseSlug: string;
  correctBySkill: Record<SkillCategory, { correct: number; total: number }>;
  attemptIds: string[];
}

const skillName = (id: string) => db().skills.find((s) => s.id === id)?.name ?? id;

function stripSet(s: PracticeSet): PracticeSet {
  return { ...s, questions: s.questions.map(publicQuestion) };
}

function canTake(userId: string, set: PracticeSet) {
  if (!set.courseId) return true;
  const l = db().lessons.find((x) => x.id === set.lessonId);
  const e = enrollmentOf(userId, set.courseId);
  if (!e) return !!l?.freePreview;
  return !!l && isLessonUnlocked(l, e);
}

export const practiceApi = {
  /** "Practice sets" page: every set in the learner's courses with best and last score. */
  list(params: { skill?: SkillCategory | "all"; courseId?: string } = {}) {
    return request<PracticeListItem[]>("GET", `/me/practice-sets${qs(params)}`, undefined, () => {
      const u = requireUser(["learner"]);
      const d = db();
      const mine = d.enrollments.filter((e) => e.userId === u.id && e.status !== "left");
      const items: PracticeListItem[] = [];
      for (const e of mine) {
        const c = courseById(e.courseId);
        if (!c || (params.courseId && params.courseId !== c.id)) continue;
        for (const l of lessonsOf(c.id)) {
          const s = setOf(l.practiceSetId);
          if (!s || s.status !== "published") continue;
          if (params.skill && params.skill !== "all" && s.skill !== params.skill) continue;
          const atts = d.attempts.filter((a) => a.userId === u.id && a.quizId === s.id);
          const done = atts.filter((a) => a.status === "submitted").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
          items.push({
            set: { id: s.id, code: s.code, title: s.title, skill: s.skill, minutes: s.minutes, questions: s.questions.length },
            course: { id: c.id, slug: c.slug, levelName: c.levelName, level: c.level }, lessonId: l.id, lessonTitle: l.title, unlocked: isLessonUnlocked(l, e),
            attempts: done.length, best: done.length ? Math.max(...done.map((a) => a.totalScore)) : null,
            last: done[0] ? { score: done[0].totalScore, max: done[0].maxScore, at: done[0].completedAt!, attemptId: done[0].id } : null,
            inProgress: atts.some((a) => a.status === "in_progress"),
          });
        }
      }
      return items.sort((a, b) => b.course.level - a.course.level || SKILL_CATEGORIES.indexOf(a.set.skill) - SKILL_CATEGORIES.indexOf(b.set.skill) || Number(a.set.code.split(".")[1]) - Number(b.set.code.split(".")[1]));
    });
  },

  /** Starts a new attempt or resumes the open one (answers + remaining time are restored). */
  start(setId: string) {
    return request<AttemptSession>("POST", `/practice-sets/${setId}/attempts`, {}, () => {
      const u = requireUser(["learner"]);
      const s = setOf(setId);
      if (!s || s.status !== "published" || !s.courseId) throw new ApiError(404, "NOT_FOUND", "Practice set not found.");
      if (!s.questions.length) throw new ApiError(409, "EMPTY_SET", "This practice set doesn't have any questions yet.");
      if (!canTake(u.id, s)) throw new ApiError(403, "LOCKED", "Enroll and finish the previous lessons to unlock this practice set.");
      let a = db().attempts.find((x) => x.userId === u.id && x.quizId === setId && x.status === "in_progress");
      if (!a) {
        a = { id: uid("att"), userId: u.id, quizId: setId, kind: "practice", status: "in_progress", answers: {}, remainingSeconds: s.minutes * 60, totalScore: 0, maxScore: s.questions.length, startedAt: nowIso(), responses: [] };
        db().attempts.push(a);
        commit();
      }
      const l = db().lessons.find((x) => x.id === s.lessonId);
      return { set: stripSet(s), attempt: a, course: courseById(s.courseId) ?? null, lessonTitle: l?.title };
    });
  },

  save(attemptId: string, answers: Record<string, string>, remainingSeconds: number, flagged?: string[]) {
    return request<{ ok: true }>("PUT", `/attempts/${attemptId}`, { answers, remainingSeconds, flagged }, () => {
      const u = requireUser(["learner"]);
      const a = db().attempts.find((x) => x.id === attemptId && x.userId === u.id);
      if (!a || a.status !== "in_progress") throw new ApiError(409, "ATTEMPT_CLOSED", "This attempt has already been submitted.");
      a.answers = answers;
      a.remainingSeconds = Math.max(0, Math.round(remainingSeconds));
      a.flagged = flagged;
      commit();
      return { ok: true as const };
    });
  },

  /** Scores the attempt, runs BKT on every response, then the remediation recommender (proposal §3–4). */
  submit(attemptId: string, answers: Record<string, string>, timings: Record<string, number> = {}) {
    return request<AttemptResult>("POST", `/attempts/${attemptId}/submit`, { answers, timings }, () => {
      const u = requireUser(["learner"]);
      const d = db();
      const a = d.attempts.find((x) => x.id === attemptId && x.userId === u.id);
      if (!a) throw new ApiError(404, "NOT_FOUND", "Attempt not found.");
      if (a.status === "submitted") return practiceApi._result(a.id, u.id);
      const s = setOf(a.quizId)!;
      const before = masteryMap(u.id);
      let after = { ...before };
      const touched = new Set<string>();
      a.responses = s.questions.map((q, i) => {
        const userAnswer = answers[q.id] ?? "";
        const ok = isCorrect(q, userAnswer);
        after = applyResponse(after, q, ok);
        q.skills.forEach((x) => touched.add(x.skillId));
        return { questionId: q.id, userAnswer, isCorrect: ok, attemptOrder: i + 1, responseTimeSeconds: Math.round(timings[q.id] ?? 0) };
      });
      a.answers = answers;
      a.totalScore = a.responses.filter((r) => r.isCorrect).length;
      a.maxScore = s.questions.length;
      a.status = "submitted";
      a.completedAt = nowIso();
      a.remainingSeconds = undefined;
      a.masteryBefore = Object.fromEntries([...touched].map((k) => [k, before[k]]));
      a.masteryAfter = Object.fromEntries([...touched].map((k) => [k, after[k]]));
      saveMastery(u.id, after, [...touched]);

      const e = s.courseId ? enrollmentOf(u.id, s.courseId) : undefined;
      if (e) {
        // clear gates whose skill recovered or whose remediation set was just completed
        for (const g of e.remediation ?? []) {
          if (g.clearedAt) continue;
          if ((after[g.skillId] ?? 0) >= MASTERY_THRESHOLD) { g.clearedAt = nowIso(); g.clearedBy = "mastery"; }
          else if (g.recommendationTargets.includes(s.id)) { g.clearedAt = nowIso(); g.clearedBy = "remediation"; }
        }
      }
      // remediation for other courses' gates too (a Foundation review set can clear an Intermediate gate)
      for (const other of d.enrollments.filter((x) => x.userId === u.id && x !== e)) for (const g of other.remediation ?? []) {
        if (!g.clearedAt && (g.recommendationTargets.includes(s.id) || (after[g.skillId] ?? 0) >= MASTERY_THRESHOLD)) { g.clearedAt = nowIso(); g.clearedBy = g.recommendationTargets.includes(s.id) ? "remediation" : "mastery"; }
      }

      // recommendations + gate creation
      const t0 = performance.now();
      const level = s.courseId ? courseById(s.courseId)?.level : 2;
      const recs = recommendRemediation({ mastery: after, skills: d.skills, courses: d.courses, lessons: d.lessons, sets: d.practiceSets, enrollments: d.enrollments.filter((x) => x.userId === u.id && x.status !== "left"), testedSkillIds: [...touched], excludeSetId: s.id, currentLevel: level, k: 3 });
      const recLatencyMs = performance.now() - t0;
      a.recommendationIds = recs.map((r) => r.id);

      const lesson = d.lessons.find((l) => l.id === s.lessonId);
      if (e && lesson) {
        const primary = lesson.skillIds[0];
        const next = lessonsOf(lesson.courseId).find((l) => l.skill === lesson.skill && l.order === lesson.order + 1);
        if (next && (after[primary] ?? 0) < MASTERY_THRESHOLD && !e.completedLessonIds.includes(next.id) && !(e.remediation ?? []).some((g) => !g.clearedAt && g.beforeLessonId === next.id)) {
          const targets = recs.filter((r) => r.skillId === primary).map((r) => r.targetId);
          e.remediation = [...(e.remediation ?? []), { id: uid("gate"), skillId: primary, beforeLessonId: next.id, fromSetId: s.id, masteryAtCreation: after[primary], recommendationTargets: targets.length ? targets : [s.id], createdAt: nowIso() }];
        }
      }
      const { bands } = bandsBySkill(after, d.skills);
      notify(u.id, { type: "result", title: `Practice set ${s.code} scored`, body: `You scored ${a.totalScore} / ${a.maxScore} on ${s.title}. Your ${s.skill} estimate is now ${bands[s.skill].toFixed(1)}.`, link: `/practice/result/${a.id}` });
      commit();
      const res = practiceApi._result(a.id, u.id);
      res.recLatencyMs = recLatencyMs;
      return res;
    });
  },

  result(attemptId: string) {
    return request<AttemptResult>("GET", `/attempts/${attemptId}`, undefined, () => {
      const u = requireUser();
      const a = db().attempts.find((x) => x.id === attemptId);
      if (!a || (u.role === "learner" && a.userId !== u.id)) throw new ApiError(404, "NOT_FOUND", "Result not found.");
      if (a.status !== "submitted") throw new ApiError(409, "IN_PROGRESS", "This attempt hasn't been submitted yet.");
      return practiceApi._result(a.id, a.userId);
    });
  },

  /** @internal builds the result DTO (shared by submit and result). */
  _result(attemptId: string, userId: string): AttemptResult {
    const d = db();
    const a = d.attempts.find((x) => x.id === attemptId)!;
    const s = setOf(a.quizId)!;
    const after = masteryMap(userId);
    const { bands, overall } = bandsBySkill(after, d.skills);
    const changes: SkillChange[] = Object.keys(a.masteryAfter ?? {}).map((k) => ({
      skillId: k, name: skillName(k), category: d.skills.find((x) => x.id === k)?.category ?? s.skill, before: a.masteryBefore?.[k] ?? 0, after: a.masteryAfter?.[k] ?? 0,
    })).sort((x, y) => x.after - y.after);
    const mine = d.enrollments.filter((x) => x.userId === userId && x.status !== "left");
    const level = s.courseId ? courseById(s.courseId)?.level : 2;
    const recomputeMastery = { ...after, ...(a.masteryAfter ?? {}) };
    const t0 = performance.now();
    const recommendations = recommendRemediation({ mastery: recomputeMastery, skills: d.skills, courses: d.courses, lessons: d.lessons, sets: d.practiceSets, enrollments: mine, testedSkillIds: Object.keys(a.masteryAfter ?? {}), excludeSetId: s.id, currentLevel: level, k: 3 });
    const recLatencyMs = performance.now() - t0;
    const e = s.courseId ? enrollmentOf(userId, s.courseId) : undefined;
    const g = (e?.remediation ?? []).find((x) => x.fromSetId === s.id && !x.clearedAt);
    const lesson = d.lessons.find((l) => l.id === s.lessonId);
    const course = s.courseId ? courseById(s.courseId) ?? null : null;
    const next = lesson ? lessonsOf(lesson.courseId).find((l) => l.skill === lesson.skill && l.order === lesson.order + 1) : undefined;
    return {
      attempt: a, set: s, course, changes, bands, overall, recommendations, recLatencyMs,
      gate: g ? { ...g, skillName: skillName(g.skillId), beforeLessonTitle: d.lessons.find((l) => l.id === g.beforeLessonId)?.title ?? "" } : null,
      nextLesson: next && course ? { id: next.id, title: next.title, courseSlug: course.slug } : undefined,
    };
  },

  history() {
    return request<{ attemptId: string; set: Pick<PracticeSet, "id" | "code" | "title" | "skill">; courseLevelName: string; score: number; max: number; completedAt: string; kind: string }[]>("GET", "/me/attempts", undefined, () => {
      const u = requireUser(["learner"]);
      return db().attempts
        .filter((a) => a.userId === u.id && a.status === "submitted")
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
        .map((a) => {
          const s = setOf(a.quizId)!;
          return { attemptId: a.id, set: { id: s.id, code: s.code, title: s.title, skill: s.skill }, courseLevelName: s.courseId ? courseById(s.courseId)?.levelName ?? "" : "Placement", score: a.totalScore, max: a.maxScore, completedAt: a.completedAt!, kind: a.kind };
        });
    });
  },

  mastery() {
    return request<{ skills: Skill[]; mastery: Record<string, number>; attempts: Record<string, number>; bands: Record<SkillCategory, number>; overall: number; categoryMastery: Record<SkillCategory, number>; threshold: number; targetBand: number; links: Record<string, { href: string; label: string }> }>("GET", "/me/mastery", undefined, () => {
      const u = requireUser(["learner"]);
      const d = db();
      const mastery = masteryMap(u.id);
      const { bands, overall } = bandsBySkill(mastery, d.skills);
      const attempts = Object.fromEntries(d.mastery.filter((m) => m.userId === u.id).map((m) => [m.skillId, m.attempts]));
      const mine = d.enrollments.filter((e) => e.userId === u.id && e.status !== "left");
      const links: Record<string, { href: string; label: string }> = {};
      for (const sk of d.skills) {
        for (const e of mine) {
          const c = courseById(e.courseId);
          if (!c) continue;
          const ls = lessonsOf(c.id).filter((l) => l.skillIds[0] === sk.id || l.skillIds.includes(sk.id));
          const done = ls.find((l) => e.completedLessonIds.includes(l.id));
          const open = ls.find((l) => isLessonUnlocked(l, e));
          if (done) { links[sk.id] = { href: `/practice/${done.practiceSetId}`, label: `Practise · ${setOf(done.practiceSetId)?.code}` }; break; }
          if (open) { links[sk.id] = { href: `/learn/${c.slug}/${open.id}`, label: "Open lesson" }; break; }
        }
      }
      return { links, skills: d.skills, mastery, attempts, bands, overall, categoryMastery: Object.fromEntries(SKILL_CATEGORIES.map((c) => [c, categoryMastery(mastery, d.skills, c)])) as Record<SkillCategory, number>, threshold: MASTERY_THRESHOLD, targetBand: u.targetBand };
    });
  },

  /* ───────── Placement test (cold start, proposal §4) ───────── */

  placement() {
    return request<{ sections: PracticeSet[]; totalQuestions: number; minutes: number; alreadyDone: boolean }>("GET", "/placement", undefined, () => {
      const u = requireUser(["learner"]);
      const sections = db().practiceSets.filter((s) => s.courseId === null && s.id.startsWith("placement-")).sort((a, b) => a.code.localeCompare(b.code)).map(stripSet);
      return { sections, totalQuestions: sections.reduce((n, s) => n + s.questions.length, 0), minutes: 15, alreadyDone: u.placementDone };
    });
  },

  submitPlacement(answers: Record<string, string>) {
    return request<PlacementResult>("POST", "/placement/submit", { answers }, () => {
      const u = requireUser(["learner"]);
      const d = db();
      const sections = d.practiceSets.filter((s) => s.courseId === null && s.id.startsWith("placement-"));
      // Cold start: fit each skill from the BKT prior using only placement responses.
      let m: Record<string, number> = Object.fromEntries(d.skills.map((s) => [s.id, initialMastery(s.id)]));
      const correctBySkill = Object.fromEntries(SKILL_CATEGORIES.map((c) => [c, { correct: 0, total: 0 }])) as PlacementResult["correctBySkill"];
      const attemptIds: string[] = [];
      for (const s of sections) {
        const responses = s.questions.map((q, i) => {
          const ok = isCorrect(q, answers[q.id]);
          m = applyResponse(m, q, ok);
          correctBySkill[s.skill].total += 1;
          if (ok) correctBySkill[s.skill].correct += 1;
          return { questionId: q.id, userAnswer: answers[q.id] ?? "", isCorrect: ok, attemptOrder: i + 1, responseTimeSeconds: 0 };
        });
        const at: QuizAttempt = { id: uid("att"), userId: u.id, quizId: s.id, kind: "placement", status: "submitted", answers: Object.fromEntries(s.questions.map((q) => [q.id, answers[q.id] ?? ""])), totalScore: responses.filter((r) => r.isCorrect).length, maxScore: s.questions.length, startedAt: nowIso(), completedAt: nowIso(), responses };
        d.attempts.push(at);
        attemptIds.push(at.id);
      }
      // Skills with no placement item inherit their category's accuracy as a prior.
      const tested = new Set(sections.flatMap((s) => s.questions.flatMap((q) => q.skills.map((x) => x.skillId))));
      for (const sk of d.skills) {
        if (tested.has(sk.id)) continue;
        const acc = correctBySkill[sk.category].total ? correctBySkill[sk.category].correct / correctBySkill[sk.category].total : 0.3;
        m[sk.id] = Math.round((0.15 + acc * 0.7) * 1000) / 1000;
      }
      // overwrite this learner's mastery vector
      d.mastery = d.mastery.filter((x) => x.userId !== u.id);
      for (const sk of d.skills) d.mastery.push({ userId: u.id, skillId: sk.id, masteryProb: m[sk.id], attempts: tested.has(sk.id) ? 1 : 0, updatedAt: nowIso() });
      const { bands, overall } = bandsBySkill(m, d.skills);
      const placementBand = overall;
      const level = recommendedLevelForBand(placementBand);
      u.placementDone = true;
      u.placementBand = placementBand;
      u.recommendedLevel = level;
      const course = d.courses.find((c) => c.level === level && c.status === "published")!;
      notify(u.id, { type: "result", title: `Placement result: Band ${placementBand.toFixed(1)}`, body: `We recommend ${course.title}. Your skill map has been initialised from your answers.`, link: `/courses/${course.slug}` });
      commit();
      return { bands, overall: placementBand, recommendedLevel: level, recommendedCourseSlug: course.slug, correctBySkill, attemptIds };
    });
  },
};
