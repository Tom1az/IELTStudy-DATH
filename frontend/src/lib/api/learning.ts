import type {
  AppNotification, Assignment, ContentReport, Course, DiscussionPost, Enrollment, Lesson, Paginated, Recommendation, RemediationGate, Skill, SkillCategory, Submission, User,
} from "@/lib/types";
import { SKILL_CATEGORIES } from "@/lib/types";
import { recommendNext } from "@/lib/adaptive/recommender";
import { bandsBySkill } from "@/lib/adaptive/bkt";
import { ApiError, qs, request } from "./client";
import { commit, currentUser, db, notify, nowIso, publicUser, requireUser, uid, validate } from "./mock-db";
import {
  canManageCourse, courseById, courseBySlug, enrollmentOf, isLessonUnlocked, lessonsOf, masteryMap, perSkillProgress, prerequisiteMet, progressOf, setOf, skillCounts,
} from "./helpers";

/* ───────── DTOs ───────── */

export interface CourseSummary extends Course {
  lessonCount: number;
  practiceSetCount: number;
  skillCounts: Record<SkillCategory, number>;
  instructorName: string;
  enrollment?: { status: Enrollment["status"]; pct: number } | null;
}

export interface LessonHit {
  lessonId: string;
  courseSlug: string;
  courseLevel: number;
  courseLevelName: string;
  skill: SkillCategory;
  order: number;
  title: string;
  videoMinutes: number;
  questions: number;
  freePreview: boolean;
}

export interface SyllabusLesson {
  id: string;
  title: string;
  shortTitle?: string;
  order: number;
  videoMinutes: number;
  questions: number;
  freePreview: boolean;
  completed: boolean;
  unlocked: boolean;
  gated: boolean;
}

export interface CourseDetail {
  course: CourseSummary;
  instructor: { name: string; bio?: string };
  sections: { skill: SkillCategory; lessons: SyllabusLesson[] }[];
  enrollment: Enrollment | null;
  canEnroll: { ok: boolean; reason?: string };
  learners: number;
}

export interface LessonView {
  course: Course;
  lesson: Lesson;
  sections: { skill: SkillCategory; done: number; total: number; lessons: SyllabusLesson[] }[];
  enrollment: Enrollment | null;
  progress: { done: number; total: number; pct: number };
  practice: { id: string; code: string; title: string; questions: number; minutes: number; kind: string } | null;
  unlocked: boolean;
  previewOnly: boolean;
  gate: (RemediationGate & { skillName: string; mastery: number; attemptId?: string }) | null;
  prevId?: string;
  nextId?: string;
  note: string;
  assignment?: Assignment;
  postCount: number;
}

export interface DashboardData {
  user: User;
  continue: { courseSlug: string; courseTitle: string; lessonId: string; lessonTitle: string; skill: SkillCategory; order: number; skillTotal: number; pct: number } | null;
  bands: Record<SkillCategory, number>;
  overall: number;
  courses: { course: Course; status: Enrollment["status"]; perSkill: { skill: SkillCategory; done: number; total: number }[]; pct: number }[];
  upNext: Recommendation[];
  recLatencyMs: number;
  recent: { attemptId: string; setId: string; setCode: string; setTitle: string; skill: SkillCategory; score: number; max: number; completedAt: string }[];
  deadlines: { assignment: Assignment; submitted: boolean }[];
  inProgressAttempt?: { setId: string; code: string; answered: number; total: number };
}

const instructorName = (id: string) => db().users.find((u) => u.id === id)?.name ?? "Instructor";

function summarize(c: Course, userId?: string): CourseSummary {
  const ls = lessonsOf(c.id);
  const e = userId ? enrollmentOf(userId, c.id) : undefined;
  return { ...c, lessonCount: ls.length, practiceSetCount: ls.filter((l) => !!setOf(l.practiceSetId)).length, skillCounts: skillCounts(ls), instructorName: instructorName(c.instructorId), enrollment: e ? { status: e.status, pct: progressOf(e).pct } : null };
}

function syllabus(c: Course, e: Enrollment | undefined) {
  const gates = (e?.remediation ?? []).filter((g) => !g.clearedAt);
  return SKILL_CATEGORIES.map((skill) => {
    const lessons = lessonsOf(c.id).filter((l) => l.skill === skill).map<SyllabusLesson>((l) => ({
      id: l.id, title: l.title, shortTitle: l.shortTitle, order: l.order, videoMinutes: l.videoMinutes, questions: setOf(l.practiceSetId)?.questions.length ?? 0,
      freePreview: l.freePreview, completed: !!e?.completedLessonIds.includes(l.id), unlocked: isLessonUnlocked(l, e), gated: gates.some((g) => g.beforeLessonId === l.id),
    }));
    return { skill, lessons, done: lessons.filter((l) => l.completed).length, total: lessons.length };
  }).filter((s) => s.total > 0);
}

/* ───────── Catalog ───────── */

export const catalogApi = {
  /** Course catalogue with lesson search, skill filter and pagination (requirement 4.2). */
  list(params: { q?: string; skill?: SkillCategory | "all"; page?: number; pageSize?: number } = {}) {
    return request<{ courses: CourseSummary[]; lessons: Paginated<LessonHit> }>("GET", `/courses${qs(params)}`, undefined, () => {
      const u = currentUser();
      const page = Math.max(1, params.page ?? 1);
      const pageSize = params.pageSize ?? 8;
      const q = (params.q ?? "").trim().toLowerCase();
      const skill = params.skill && params.skill !== "all" ? params.skill : undefined;
      const published = db().courses.filter((c) => c.status === "published").sort((a, b) => a.level - b.level);
      const courses = published.map((c) => summarize(c, u?.id)).filter((c) => !skill || c.skillCounts[skill] > 0);
      let hits: LessonHit[] = [];
      if (q || skill) {
        hits = published.flatMap((c) =>
          lessonsOf(c.id)
            .filter((l) => (!skill || l.skill === skill) && (!q || `${l.title} ${setOf(l.practiceSetId)?.title ?? ""} ${l.skillIds.join(" ")}`.toLowerCase().includes(q)))
            .map((l) => ({ lessonId: l.id, courseSlug: c.slug, courseLevel: c.level, courseLevelName: c.levelName, skill: l.skill, order: l.order, title: l.title, videoMinutes: l.videoMinutes, questions: setOf(l.practiceSetId)?.questions.length ?? 0, freePreview: l.freePreview })),
        );
      }
      const total = hits.length;
      return { courses, lessons: { items: hits.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
    });
  },

  /** Micro-skill taxonomy (public). */
  skills() {
    return request<Skill[]>("GET", "/skills", undefined, () => db().skills);
  },

  get(slug: string) {
    return request<CourseDetail>("GET", `/courses/${slug}`, undefined, () => {
      const u = currentUser();
      const c = courseBySlug(slug);
      if (!c || (c.status !== "published" && !(u && canManageCourse(u, c)))) throw new ApiError(404, "NOT_FOUND", "Course not found.");
      const e = u ? enrollmentOf(u.id, c.id) : undefined;
      const instr = db().users.find((x) => x.id === c.instructorId);
      return {
        course: summarize(c, u?.id), instructor: { name: instr?.name ?? "Instructor", bio: instr?.bio }, sections: syllabus(c, e).map(({ skill, lessons }) => ({ skill, lessons })),
        enrollment: e ?? null, canEnroll: u ? (u.role === "learner" ? prerequisiteMet(u, c) : { ok: false, reason: "Only learner accounts can enroll." }) : { ok: true },
        learners: db().enrollments.filter((x) => x.courseId === c.id && x.status !== "left").length,
      };
    });
  },

  enroll(courseId: string, override = false) {
    return request<Enrollment>("POST", `/courses/${courseId}/enroll`, { override }, () => {
      const u = requireUser(["learner"]);
      const c = courseById(courseId);
      if (!c || c.status !== "published") throw new ApiError(404, "NOT_FOUND", "Course not found.");
      const existing = db().enrollments.find((e) => e.userId === u.id && e.courseId === courseId);
      if (existing && existing.status !== "left") return existing;
      const pre = prerequisiteMet(u, c);
      if (!pre.ok && !override) throw new ApiError(409, "PREREQUISITE_NOT_MET", pre.reason ?? "Prerequisite not met.");
      const ls = lessonsOf(c.id);
      if (existing) {
        existing.status = "active";
        existing.enrolledAt = nowIso();
        commit();
        return existing;
      }
      const e: Enrollment = { id: uid("enr"), userId: u.id, courseId, status: "active", enrolledAt: nowIso(), completedLessonIds: [], lastLessonId: ls[0]?.id };
      db().enrollments.push(e);
      notify(u.id, { type: "new_content", title: `Enrolled in ${c.title}`, body: `Start with ${ls[0]?.title ?? "the first lesson"}. Your progress is saved as you go.`, link: `/learn/${c.slug}/${ls[0]?.id}` });
      commit();
      return e;
    });
  },

  leave(courseId: string) {
    return request<{ ok: true }>("POST", `/courses/${courseId}/leave`, {}, () => {
      const u = requireUser(["learner"]);
      const e = enrollmentOf(u.id, courseId);
      if (!e) throw new ApiError(404, "NOT_ENROLLED", "You are not enrolled in this course.");
      e.status = "left";
      commit();
      return { ok: true as const };
    });
  },
};

/* ───────── Lessons ───────── */

export const lessonApi = {
  get(courseSlug: string, lessonId: string) {
    return request<LessonView>("GET", `/courses/${courseSlug}/lessons/${lessonId}`, undefined, () => {
      const u = currentUser();
      const c = courseBySlug(courseSlug);
      const l = db().lessons.find((x) => x.id === lessonId && x.courseId === c?.id);
      if (!c || !l) throw new ApiError(404, "NOT_FOUND", "Lesson not found.");
      const manager = !!u && canManageCourse(u, c);
      if (l.status !== "published" && !manager) throw new ApiError(404, "NOT_FOUND", "This lesson is not available.");
      const e = u ? enrollmentOf(u.id, c.id) : undefined;
      if (!e && !l.freePreview && !manager) throw new ApiError(403, "NOT_ENROLLED", "Enroll in this course to open this lesson.");
      const all = lessonsOf(c.id);
      const idx = all.findIndex((x) => x.id === l.id);
      const set = setOf(l.practiceSetId);
      const gate = (e?.remediation ?? []).find((g) => g.beforeLessonId === l.id && !g.clearedAt);
      const mastery = u ? masteryMap(u.id) : {};
      const assignment = db().assignments.find((a) => a.lessonId === l.id);
      return {
        course: c, lesson: l, sections: syllabus(c, e), enrollment: e ?? null, progress: e ? progressOf(e) : { done: 0, total: all.length, pct: 0 },
        practice: set ? { id: set.id, code: set.code, title: set.title, questions: set.questions.length, minutes: set.minutes, kind: set.passage.kind } : null,
        unlocked: manager || isLessonUnlocked(l, e), previewOnly: !e && !manager,
        gate: gate ? { ...gate, skillName: db().skills.find((s) => s.id === gate.skillId)?.name ?? gate.skillId, mastery: mastery[gate.skillId] ?? 0, attemptId: db().attempts.filter((a) => a.userId === u?.id && a.quizId === gate.fromSetId && a.status === "submitted").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0]?.id } : null,
        prevId: all[idx - 1]?.id, nextId: all[idx + 1]?.id,
        note: (u && db().notes.find((n) => n.userId === u.id && n.lessonId === l.id)?.text) ?? "",
        assignment,
        postCount: db().posts.filter((p) => p.lessonId === l.id && (!p.hidden || manager)).length,
      };
    });
  },

  /** Printable lesson resource (slides, vocabulary list, checklist). */
  resource(courseSlug: string, lessonId: string, resourceId: string) {
    return request<{ course: Course; lesson: Lesson; resource: Lesson["resources"][number]; passage: { title: string; text: string[] } | null }>("GET", `/courses/${courseSlug}/lessons/${lessonId}/resources/${resourceId}`, undefined, () => {
      const u = currentUser();
      const c = courseBySlug(courseSlug);
      const l = db().lessons.find((x) => x.id === lessonId && x.courseId === c?.id);
      const r = l?.resources.find((x) => x.id === resourceId);
      if (!c || !l || !r) throw new ApiError(404, "NOT_FOUND", "Resource not found.");
      if (!l.freePreview && !(u && (enrollmentOf(u.id, c.id) || canManageCourse(u, c)))) throw new ApiError(403, "NOT_ENROLLED", "Enroll in this course to download resources.");
      const set = setOf(l.practiceSetId);
      const text = set ? [...set.passage.paragraphs.map((p) => p.text), ...(set.passage.audioScript ?? []).map((a) => a.text)] : [];
      return { course: c, lesson: l, resource: r, passage: set ? { title: set.passage.title, text } : null };
    });
  },

  complete(lessonId: string) {
    return request<{ enrollment: Enrollment; courseCompleted: boolean; nextLessonId?: string }>("POST", `/lessons/${lessonId}/complete`, {}, () => {
      const u = requireUser(["learner"]);
      const l = db().lessons.find((x) => x.id === lessonId);
      if (!l) throw new ApiError(404, "NOT_FOUND", "Lesson not found.");
      const e = enrollmentOf(u.id, l.courseId);
      if (!e) throw new ApiError(403, "NOT_ENROLLED", "Enroll in this course to track progress.");
      if (!isLessonUnlocked(l, e)) throw new ApiError(409, "LESSON_LOCKED", "Complete the previous lessons in this skill first.");
      if (!e.completedLessonIds.includes(l.id)) e.completedLessonIds.push(l.id);
      const all = lessonsOf(l.courseId);
      const next = all.find((x) => !e.completedLessonIds.includes(x.id) && isLessonUnlocked(x, e) && x.skill === l.skill) ?? all.find((x) => !e.completedLessonIds.includes(x.id) && isLessonUnlocked(x, e));
      e.lastLessonId = next?.id ?? l.id;
      // a completed remediation lesson clears gates that recommended it
      for (const g of e.remediation ?? []) if (!g.clearedAt && g.recommendationTargets.includes(l.id)) { g.clearedAt = nowIso(); g.clearedBy = "remediation"; }
      let courseCompleted = false;
      if (all.every((x) => e.completedLessonIds.includes(x.id)) && e.status !== "completed") {
        e.status = "completed";
        e.completedAt = nowIso();
        courseCompleted = true;
        const c = courseById(l.courseId)!;
        notify(u.id, { type: "result", title: `You completed ${c.title}!`, body: "Your next level is now unlocked.", link: "/courses" });
      }
      commit();
      return { enrollment: e, courseCompleted, nextLessonId: next?.id };
    });
  },

  savePosition(lessonId: string, seconds: number) {
    return request<{ ok: true }>("PUT", `/lessons/${lessonId}/position`, { seconds }, () => {
      const u = currentUser();
      const l = db().lessons.find((x) => x.id === lessonId);
      if (!u || !l) return { ok: true as const };
      const e = enrollmentOf(u.id, l.courseId);
      if (e) {
        e.lastPositionSeconds = { ...(e.lastPositionSeconds ?? {}), [lessonId]: Math.round(seconds) };
        if (!e.completedLessonIds.includes(lessonId)) e.lastLessonId = lessonId;
        commit();
      }
      return { ok: true as const };
    });
  },

  overrideGate(gateId: string) {
    return request<{ ok: true }>("POST", `/remediation/${gateId}/override`, {}, () => {
      const u = requireUser(["learner"]);
      for (const e of db().enrollments.filter((x) => x.userId === u.id)) for (const g of e.remediation ?? []) if (g.id === gateId) { g.clearedAt = nowIso(); g.clearedBy = "override"; }
      commit();
      return { ok: true as const };
    });
  },

  saveNote(lessonId: string, text: string) {
    return request<{ ok: true; updatedAt: string }>("PUT", `/lessons/${lessonId}/notes`, { text }, () => {
      const u = requireUser();
      validate({ text: text.length > 5000 && "Notes are limited to 5,000 characters." });
      const n = db().notes.find((x) => x.userId === u.id && x.lessonId === lessonId);
      const at = nowIso();
      if (n) { n.text = text; n.updatedAt = at; } else db().notes.push({ userId: u.id, lessonId, text, updatedAt: at });
      commit();
      return { ok: true as const, updatedAt: at };
    });
  },

  posts(lessonId: string) {
    return request<DiscussionPost[]>("GET", `/lessons/${lessonId}/posts`, undefined, () => {
      const u = currentUser();
      const canModerate = !!u && u.role !== "learner";
      return db().posts.filter((p) => p.lessonId === lessonId && (!p.hidden || canModerate)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  },

  addPost(lessonId: string, body: string, parentId?: string) {
    return request<DiscussionPost>("POST", `/lessons/${lessonId}/posts`, { body, parentId }, () => {
      const u = requireUser();
      validate({ body: body.trim().length < 2 ? "Write a message first." : body.length > 2000 && "Keep posts under 2,000 characters." });
      const l = db().lessons.find((x) => x.id === lessonId);
      if (!l) throw new ApiError(404, "NOT_FOUND", "Lesson not found.");
      if (u.role === "learner" && !enrollmentOf(u.id, l.courseId)) throw new ApiError(403, "NOT_ENROLLED", "Enroll to join the discussion.");
      const p: DiscussionPost = { id: uid("post"), lessonId, userId: u.id, authorName: u.name, authorRole: u.role, body: body.trim(), parentId, createdAt: nowIso() };
      db().posts.push(p);
      if (parentId) {
        const parent = db().posts.find((x) => x.id === parentId);
        if (parent && parent.userId !== u.id) notify(parent.userId, { type: "review", title: `${u.name} replied in a discussion`, body: `New reply on ${l.title}.`, link: `/learn/${courseById(l.courseId)?.slug}/${l.id}?tab=discussion` });
      } else {
        const c = courseById(l.courseId);
        if (c && c.instructorId !== u.id) notify(c.instructorId, { type: "review", title: "New question in a lesson discussion", body: `${u.name} posted on ${l.title}.`, link: `/learn/${c.slug}/${l.id}?tab=discussion` });
      }
      commit();
      return p;
    });
  },

  report(input: { targetType: ContentReport["targetType"]; targetId: string; targetPreview: string; reason: string; details?: string }) {
    return request<ContentReport>("POST", "/reports", input, () => {
      const u = requireUser();
      validate({ reason: !input.reason && "Choose a reason." });
      const r: ContentReport = { ...input, id: uid("rep"), reporterId: u.id, reporterName: u.name, status: "open", createdAt: nowIso() };
      db().reports.unshift(r);
      for (const a of db().users.filter((x) => x.role === "admin")) notify(a.id, { type: "system", title: "New content report", body: `${input.reason}: “${input.targetPreview.slice(0, 60)}”`, link: "/admin/reports" });
      commit();
      return r;
    });
  },
};

/* ───────── Dashboard / My learning ───────── */

export const meApi = {
  dashboard() {
    return request<DashboardData>("GET", "/me/dashboard", undefined, () => {
      const u = requireUser(["learner"]);
      const d = db();
      const mine = d.enrollments.filter((e) => e.userId === u.id && e.status !== "left");
      const mastery = masteryMap(u.id);
      const { bands, overall } = bandsBySkill(mastery, d.skills);
      const t0 = performance.now();
      const upNext = recommendNext({ mastery, skills: d.skills, courses: d.courses, lessons: d.lessons, sets: d.practiceSets, enrollments: mine, k: 3 });
      const recLatencyMs = performance.now() - t0;
      for (const r of upNext) d.recEvents.push({ id: uid("ev"), userId: u.id, recId: r.id, targetId: r.targetId, action: "shown", at: nowIso() });

      const active = mine.filter((e) => e.status === "active").sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt));
      let cont: DashboardData["continue"] = null;
      const e0 = active[0];
      if (e0) {
        const c = courseById(e0.courseId)!;
        const l = d.lessons.find((x) => x.id === e0.lastLessonId) ?? lessonsOf(c.id).find((x) => !e0.completedLessonIds.includes(x.id));
        if (l) cont = { courseSlug: c.slug, courseTitle: c.title, lessonId: l.id, lessonTitle: l.title, skill: l.skill, order: l.order, skillTotal: lessonsOf(c.id).filter((x) => x.skill === l.skill).length, pct: progressOf(e0).pct };
      }
      const courses = mine
        .map((e) => ({ course: courseById(e.courseId)!, status: e.status, perSkill: perSkillProgress(e), pct: progressOf(e).pct }))
        .filter((x) => x.course)
        .sort((a, b) => (a.status === "active" ? -1 : 1) - (b.status === "active" ? -1 : 1) || b.course.level - a.course.level);

      const recent = d.attempts
        .filter((a) => a.userId === u.id && a.status === "submitted" && a.kind === "practice")
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
        .slice(0, 4)
        .map((a) => { const s = setOf(a.quizId)!; return { attemptId: a.id, setId: s.id, setCode: s.code, setTitle: s.title, skill: s.skill, score: a.totalScore, max: a.maxScore, completedAt: a.completedAt! }; });

      const courseIds = new Set(mine.map((e) => e.courseId));
      const deadlines = d.assignments
        .filter((a) => courseIds.has(a.courseId) && Date.parse(a.dueAt) > Date.now() - 86400000)
        .map((a) => ({ assignment: a, submitted: d.submissions.some((s) => s.assignmentId === a.id && s.userId === u.id) }))
        .sort((a, b) => a.assignment.dueAt.localeCompare(b.assignment.dueAt));

      const live = d.attempts.find((a) => a.userId === u.id && a.status === "in_progress" && a.kind === "practice");
      const liveSet = live ? setOf(live.quizId) : undefined;
      commit();
      return {
        user: publicUser(u), continue: cont, bands, overall, courses, upNext, recLatencyMs, recent, deadlines,
        inProgressAttempt: live && liveSet ? { setId: liveSet.id, code: liveSet.code, answered: Object.values(live.answers).filter(Boolean).length, total: liveSet.questions.length } : undefined,
      };
    });
  },

  recommendationFeedback(rec: Recommendation, action: "clicked" | "helpful" | "not_helpful") {
    return request<{ ok: true }>("POST", "/recommendations/feedback", { recId: rec.id, action }, () => {
      const u = requireUser();
      db().recEvents.push({ id: uid("ev"), userId: u.id, recId: rec.id, targetId: rec.targetId, action, at: nowIso() });
      commit();
      return { ok: true as const };
    });
  },

  notifications() {
    return request<AppNotification[]>("GET", "/me/notifications", undefined, () => {
      const u = requireUser();
      ensureDeadlineReminders(u.id);
      return db().notifications.filter((n) => n.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  },

  markRead(ids: string[] | "all") {
    return request<{ ok: true }>("POST", "/me/notifications/read", { ids }, () => {
      const u = requireUser();
      for (const n of db().notifications) if (n.userId === u.id && (ids === "all" || ids.includes(n.id))) n.read = true;
      commit();
      return { ok: true as const };
    });
  },

  assignment(id: string) {
    return request<{ assignment: Assignment; course: Course; lesson: Lesson; submission: Submission | null }>("GET", `/assignments/${id}`, undefined, () => {
      const u = requireUser();
      const a = db().assignments.find((x) => x.id === id);
      if (!a) throw new ApiError(404, "NOT_FOUND", "Assignment not found.");
      const c = courseById(a.courseId)!;
      if (u.role === "learner" && !enrollmentOf(u.id, c.id)) throw new ApiError(403, "NOT_ENROLLED", "Enroll in this course to see this task.");
      return { assignment: a, course: c, lesson: db().lessons.find((l) => l.id === a.lessonId)!, submission: db().submissions.find((s) => s.assignmentId === id && s.userId === u.id) ?? null };
    });
  },

  submitAssignment(id: string, input: { text: string; fileName?: string; fileSize?: number }) {
    return request<Submission>("POST", `/assignments/${id}/submissions`, input, () => {
      const u = requireUser(["learner"]);
      const a = db().assignments.find((x) => x.id === id);
      if (!a) throw new ApiError(404, "NOT_FOUND", "Assignment not found.");
      if (!enrollmentOf(u.id, a.courseId)) throw new ApiError(403, "NOT_ENROLLED", "Enroll in this course first.");
      const wordCount = input.text.trim() ? input.text.trim().split(/\s+/).length : 0;
      validate({ text: !input.text.trim() && !input.fileName && "Paste your answer or attach a file.", fileSize: (input.fileSize ?? 0) > 10 * 1024 * 1024 && "Files must be 10 MB or smaller." });
      const existing = db().submissions.find((s) => s.assignmentId === id && s.userId === u.id);
      if (existing?.status === "graded") throw new ApiError(409, "ALREADY_GRADED", "This task has already been graded.");
      const sub: Submission = { id: existing?.id ?? uid("sub"), assignmentId: id, userId: u.id, userName: u.name, fileName: input.fileName, fileSize: input.fileSize, text: input.text, wordCount, submittedAt: nowIso(), late: Date.now() > Date.parse(a.dueAt), status: "submitted" };
      if (existing) Object.assign(existing, sub); else db().submissions.push(sub);
      const c = courseById(a.courseId)!;
      notify(c.instructorId, { type: "system", title: "New writing submission", body: `${u.name} submitted “${a.title}”.`, link: "/instructor/grading" });
      commit();
      return sub;
    });
  },
};

/** Creates one deadline reminder per assignment due within 5 days that the learner hasn't submitted. */
function ensureDeadlineReminders(userId: string) {
  const d = db();
  const mine = new Set(d.enrollments.filter((e) => e.userId === userId && e.status === "active").map((e) => e.courseId));
  for (const a of d.assignments) {
    const due = Date.parse(a.dueAt);
    if (!mine.has(a.courseId) || due < Date.now() || due - Date.now() > 5 * 86400000) continue;
    if (d.submissions.some((s) => s.assignmentId === a.id && s.userId === userId)) continue;
    if (d.notifications.some((n) => n.userId === userId && n.type === "deadline" && n.link === `/assignments/${a.id}`)) continue;
    notify(userId, { type: "deadline", title: "Writing task due soon", body: `${a.title} is due ${new Date(a.dueAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}.`, link: `/assignments/${a.id}` });
  }
  commit();
}
