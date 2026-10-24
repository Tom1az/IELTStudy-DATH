import type { Assignment, Course, Lesson, LessonResource, LessonStatus, Passage, PracticeSet, Question, SkillCategory, Submission } from "@/lib/types";
import { SKILL_CATEGORIES } from "@/lib/types";
import { MASTERY_THRESHOLD, overallBand } from "@/lib/adaptive/bkt";
import { ApiError, qs, request } from "./client";
import { audit, commit, db, notify, nowIso, requireUser, uid, validate } from "./mock-db";
import { canManageCourse, courseById, lessonsOf, masteryMap, progressOf, setOf, skillCounts } from "./helpers";

export interface StudioCourse extends Course {
  lessonCount: number;
  hiddenLessons: number;
  learners: number;
  avgProgress: number;
  completionRate: number;
  pendingSubmissions: number;
  skillCounts: Record<SkillCategory, number>;
}

export interface CourseEditor {
  course: Course;
  lessons: (Lesson & { questions: number })[];
  assignments: Assignment[];
}

export interface BankQuestion extends Question {
  setId: string;
  setCode: string;
  setTitle: string;
  lessonId: string | null;
  lessonTitle: string;
  courseId: string | null;
  courseTitle: string;
  skill: SkillCategory;
  responses: number;
  pctCorrect: number | null;
}

export interface LearnerRow {
  userId: string;
  name: string;
  email: string;
  pct: number;
  done: number;
  total: number;
  lastActiveAt?: string;
  daysInactive: number;
  avgScore: number | null;
  weakSkills: { id: string; name: string; p: number }[];
  risk: "on_track" | "watch" | "at_risk";
  riskReasons: string[];
}

function ownCourse(courseId: string) {
  const u = requireUser(["instructor", "admin"]);
  const c = courseById(courseId);
  if (!c) throw new ApiError(404, "NOT_FOUND", "Course not found.");
  if (!canManageCourse(u, c)) throw new ApiError(403, "FORBIDDEN", "You can only manage your own courses.");
  return { u, c };
}

function ownLesson(lessonId: string) {
  const l = db().lessons.find((x) => x.id === lessonId);
  if (!l) throw new ApiError(404, "NOT_FOUND", "Lesson not found.");
  return { ...ownCourse(l.courseId), l };
}

function ownSet(setId: string) {
  const s = setOf(setId);
  if (!s || !s.courseId) throw new ApiError(404, "NOT_FOUND", "Practice set not found.");
  return { ...ownCourse(s.courseId), s };
}

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
const LEVEL_NAMES = { 1: "Foundation", 2: "Intermediate", 3: "Advanced" } as const;
const BAND_RANGE = { 1: "Band 4.0 – 5.0", 2: "Band 5.5 – 6.5", 3: "Band 7.0 and above" } as const;

function renumber(courseId: string, skill: SkillCategory) {
  const d = db();
  const track = d.lessons.filter((l) => l.courseId === courseId && l.skill === skill).sort((a, b) => a.order - b.order);
  track.forEach((l, i) => {
    l.order = i + 1;
    const s = setOf(l.practiceSetId);
    if (s) s.code = `${SKILL_CATEGORIES.indexOf(skill) + 1}.${i + 1}`;
  });
}

export function learnerRisk(userId: string, courseId: string): LearnerRow | null {
  const d = db();
  const u = d.users.find((x) => x.id === userId);
  const e = d.enrollments.find((x) => x.userId === userId && x.courseId === courseId && x.status !== "left");
  if (!u || !e) return null;
  const { done, total, pct } = progressOf(e);
  const daysInactive = u.lastActiveAt ? Math.floor((Date.now() - Date.parse(u.lastActiveAt)) / 86400000) : 99;
  const setIds = new Set(lessonsOf(courseId).map((l) => l.practiceSetId));
  const atts = d.attempts.filter((a) => a.userId === userId && a.status === "submitted" && setIds.has(a.quizId));
  const avgScore = atts.length ? atts.reduce((s, a) => s + a.totalScore / a.maxScore, 0) / atts.length : null;
  const m = masteryMap(userId);
  const weakSkills = d.skills.map((s) => ({ id: s.id, name: s.name, p: m[s.id] })).filter((s) => s.p < MASTERY_THRESHOLD).sort((a, b) => a.p - b.p).slice(0, 3);
  const weeks = Math.max(1, (Date.now() - Date.parse(e.enrolledAt)) / (7 * 86400000));
  const expected = Math.min(100, weeks * 12); // ~4 lessons a week in a 32-lesson course
  const reasons: string[] = [];
  if (daysInactive >= 7) reasons.push(`Inactive for ${daysInactive} days`);
  if (e.status !== "completed" && pct < expected * 0.5) reasons.push(`Progress ${pct}% vs ${Math.round(expected)}% expected`);
  if (avgScore !== null && avgScore < 0.5) reasons.push(`Average practice score ${Math.round(avgScore * 100)}%`);
  if (weakSkills.length >= 3 && weakSkills[0].p < 0.3) reasons.push(`Very low mastery on ${weakSkills[0].name}`);
  const risk = reasons.length >= 2 ? "at_risk" : reasons.length === 1 ? "watch" : "on_track";
  return { userId, name: u.name, email: u.email, pct, done, total, lastActiveAt: u.lastActiveAt, daysInactive, avgScore, weakSkills, risk, riskReasons: reasons };
}

export const instructorApi = {
  courses() {
    return request<StudioCourse[]>("GET", "/instructor/courses", undefined, () => {
      const u = requireUser(["instructor", "admin"]);
      const d = db();
      return d.courses
        .filter((c) => u.role === "admin" || c.instructorId === u.id)
        .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title))
        .map((c) => {
          const ens = d.enrollments.filter((e) => e.courseId === c.id && e.status !== "left");
          const all = lessonsOf(c.id, true);
          const asg = d.assignments.filter((a) => a.courseId === c.id).map((a) => a.id);
          return {
            ...c, lessonCount: all.length, hiddenLessons: all.filter((l) => l.status !== "published").length, learners: ens.length,
            avgProgress: ens.length ? Math.round(ens.reduce((s, e) => s + progressOf(e).pct, 0) / ens.length) : 0,
            completionRate: ens.length ? Math.round((ens.filter((e) => e.status === "completed").length / ens.length) * 100) : 0,
            pendingSubmissions: d.submissions.filter((s) => asg.includes(s.assignmentId) && s.status === "submitted").length,
            skillCounts: skillCounts(all),
          };
        });
    });
  },

  course(id: string) {
    return request<CourseEditor>("GET", `/instructor/courses/${id}`, undefined, () => {
      const { c } = ownCourse(id);
      return { course: c, lessons: lessonsOf(c.id, true).map((l) => ({ ...l, questions: setOf(l.practiceSetId)?.questions.length ?? 0 })), assignments: db().assignments.filter((a) => a.courseId === c.id) };
    });
  },

  createCourse(input: { title: string; level: 1 | 2 | 3; tagline: string; catalogBlurb: string; hours: number; prerequisiteText: string; outcomes: string[] }) {
    return request<Course>("POST", "/instructor/courses", input, () => {
      const u = requireUser(["instructor", "admin"]);
      validate({
        title: input.title.trim().length < 4 && "Give the course a title (4+ characters).",
        tagline: input.tagline.trim().length < 10 && "Add a one-line description.",
        hours: (input.hours < 1 || input.hours > 200) && "Estimated hours must be between 1 and 200.",
      });
      let slug = slugify(input.title);
      while (db().courses.some((c) => c.slug === slug)) slug = `${slug}-${Math.floor(Math.random() * 90 + 10)}`;
      const c: Course = {
        id: uid("c"), slug, level: input.level, levelName: LEVEL_NAMES[input.level], title: input.title.trim(), bandRange: BAND_RANGE[input.level],
        tagline: input.tagline.trim(), catalogBlurb: input.catalogBlurb.trim() || input.tagline.trim(), instructorId: u.id, status: "draft",
        prerequisiteText: input.prerequisiteText || "No prerequisite", prerequisiteBand: input.level === 1 ? undefined : input.level === 2 ? 5 : 6.5, hours: input.hours,
        outcomes: input.outcomes.filter(Boolean), includes: ["Video lessons across 4 skills", "IELTS-style practice sets with explanations", "Progress tracking by skill", "Discussion board for every lesson"],
        createdAt: nowIso(), updatedAt: nowIso(),
      };
      db().courses.push(c);
      commit();
      return c;
    });
  },

  updateCourse(id: string, patch: Partial<Pick<Course, "title" | "tagline" | "catalogBlurb" | "hours" | "prerequisiteText" | "outcomes" | "includes" | "level">>) {
    return request<Course>("PATCH", `/instructor/courses/${id}`, patch, () => {
      const { c } = ownCourse(id);
      validate({ title: patch.title !== undefined && patch.title.trim().length < 4 && "Give the course a title (4+ characters)." });
      Object.assign(c, patch, { updatedAt: nowIso() });
      if (patch.level) { if ((Object.values(LEVEL_NAMES) as string[]).includes(c.levelName)) c.levelName = LEVEL_NAMES[patch.level]; c.bandRange = BAND_RANGE[patch.level]; }
      commit();
      return c;
    });
  },

  submitForReview(id: string) {
    return request<Course>("POST", `/instructor/courses/${id}/submit`, {}, () => {
      const { u, c } = ownCourse(id);
      if (!lessonsOf(c.id, true).length) throw new ApiError(409, "EMPTY_COURSE", "Add at least one lesson before submitting for review.");
      if (c.status === "published") throw new ApiError(409, "ALREADY_PUBLISHED", "This course is already published.");
      c.status = "pending";
      c.submittedAt = nowIso();
      c.reviewFeedback = undefined;
      for (const a of db().users.filter((x) => x.role === "admin")) notify(a.id, { type: "review", title: "Course awaiting review", body: `${c.title} was submitted by ${u.name}.`, link: "/admin/courses" });
      commit();
      return c;
    });
  },

  setVisibility(id: string, visible: boolean) {
    return request<Course>("POST", `/instructor/courses/${id}/visibility`, { visible }, () => {
      const { u, c } = ownCourse(id);
      if (c.status !== "published" && c.status !== "hidden") throw new ApiError(409, "NOT_APPROVED", "Only approved courses can be published or hidden. Submit it for review first.");
      c.status = visible ? "published" : "hidden";
      c.updatedAt = nowIso();
      audit(u, visible ? "course.publish" : "course.hide", c.title);
      commit();
      return c;
    });
  },

  lesson(id: string) {
    return request<{ lesson: Lesson; course: Course; set: PracticeSet | null }>("GET", `/instructor/lessons/${id}`, undefined, () => {
      const { c, l } = ownLesson(id);
      return { lesson: l, course: c, set: setOf(l.practiceSetId) ?? null };
    });
  },

  createLesson(courseId: string, input: { skill: SkillCategory; title: string; videoMinutes: number; skillIds: string[]; freePreview: boolean; bodyText: string; strategy: string[]; videoUrl?: string }) {
    return request<Lesson>("POST", `/instructor/courses/${courseId}/lessons`, input, () => {
      const { c } = ownCourse(courseId);
      validate({
        title: input.title.trim().length < 3 && "Give the lesson a title.",
        skillIds: !input.skillIds.length && "Tag at least one micro-skill so the recommender can use this lesson.",
        videoMinutes: (input.videoMinutes < 1 || input.videoMinutes > 120) && "Video length must be 1–120 minutes.",
        videoUrl: !!input.videoUrl && !/^https?:\/\//.test(input.videoUrl) && "Use a full https:// link.",
      });
      const order = db().lessons.filter((l) => l.courseId === c.id && l.skill === input.skill).length + 1;
      const id = uid("les");
      const setId = `ps-${id}`;
      const lesson: Lesson = {
        id, courseId: c.id, skill: input.skill, order, title: input.title.trim(), videoMinutes: input.videoMinutes, videoUrl: input.videoUrl || undefined, freePreview: input.freePreview,
        status: "draft", skillIds: input.skillIds, strategy: input.strategy.filter(Boolean), bodyText: input.bodyText, transcript: [input.bodyText, ...input.strategy].filter(Boolean).join("\n\n"),
        resources: [], practiceSetId: setId, updatedAt: nowIso(),
      };
      const kind: Passage["kind"] = input.skill;
      const set: PracticeSet = { id: setId, code: `${SKILL_CATEGORIES.indexOf(input.skill) + 1}.${order}`, courseId: c.id, lessonId: id, skill: input.skill, title: input.title.trim(), minutes: 10, passage: { kind, title: input.title.trim(), paragraphs: [{ label: "A", text: "Add the reading passage, transcript or task instructions here." }] }, questions: [], status: "published" };
      db().lessons.push(lesson);
      db().practiceSets.push(set);
      c.updatedAt = nowIso();
      commit();
      return lesson;
    });
  },

  updateLesson(id: string, patch: Partial<Pick<Lesson, "title" | "shortTitle" | "videoMinutes" | "skillIds" | "freePreview" | "bodyText" | "strategy" | "transcript" | "videoUrl" | "workedExample">>) {
    return request<Lesson>("PATCH", `/instructor/lessons/${id}`, patch, () => {
      const { l } = ownLesson(id);
      validate({
        title: patch.title !== undefined && patch.title.trim().length < 3 && "Give the lesson a title.",
        skillIds: patch.skillIds !== undefined && !patch.skillIds.length && "Tag at least one micro-skill.",
        videoUrl: !!patch.videoUrl && !/^https?:\/\//.test(patch.videoUrl) && "Use a full https:// link.",
      });
      Object.assign(l, patch, { updatedAt: nowIso() });
      commit();
      return l;
    });
  },

  setLessonStatus(id: string, status: LessonStatus) {
    return request<Lesson>("POST", `/instructor/lessons/${id}/status`, { status }, () => {
      const { u, c, l } = ownLesson(id);
      const wasPublished = l.status === "published";
      l.status = status;
      l.updatedAt = nowIso();
      if (status === "published" && !wasPublished && c.status === "published") {
        for (const e of db().enrollments.filter((x) => x.courseId === c.id && x.status === "active"))
          notify(e.userId, { type: "new_content", title: `New lesson in ${c.title}`, body: `${u.name} published “${l.title}”.`, link: `/learn/${c.slug}/${l.id}` });
      }
      commit();
      return l;
    });
  },

  moveLesson(id: string, dir: -1 | 1) {
    return request<{ ok: true }>("POST", `/instructor/lessons/${id}/move`, { dir }, () => {
      const { l } = ownLesson(id);
      const track = db().lessons.filter((x) => x.courseId === l.courseId && x.skill === l.skill).sort((a, b) => a.order - b.order);
      const i = track.findIndex((x) => x.id === l.id);
      const j = i + dir;
      if (j < 0 || j >= track.length) return { ok: true as const };
      [track[i].order, track[j].order] = [track[j].order, track[i].order];
      renumber(l.courseId, l.skill);
      commit();
      return { ok: true as const };
    });
  },

  deleteLesson(id: string) {
    return request<{ ok: true }>("DELETE", `/instructor/lessons/${id}`, undefined, () => {
      const { u, l } = ownLesson(id);
      const d = db();
      const used = d.enrollments.some((e) => e.completedLessonIds.includes(l.id)) || d.attempts.some((a) => a.quizId === l.practiceSetId);
      if (used) throw new ApiError(409, "IN_USE", "Learners have progress on this lesson. Hide it instead of deleting so their history is kept.");
      d.lessons = d.lessons.filter((x) => x.id !== l.id);
      d.practiceSets = d.practiceSets.filter((s) => s.id !== l.practiceSetId);
      renumber(l.courseId, l.skill);
      audit(u, "lesson.delete", l.title);
      commit();
      return { ok: true as const };
    });
  },

  addResource(lessonId: string, input: { title: string; fileName: string; size: number; kind: LessonResource["kind"]; url?: string }) {
    return request<LessonResource>("POST", `/instructor/lessons/${lessonId}/resources`, input, () => {
      const { l } = ownLesson(lessonId);
      validate({ title: !input.title.trim() && "Add a title.", size: input.size > 50 * 1024 * 1024 && "Files must be 50 MB or smaller." });
      const kb = Math.max(1, Math.round(input.size / 1024));
      const r: LessonResource = { id: uid("res"), title: input.title.trim(), meta: `${kb >= 1024 ? (kb / 1024).toFixed(1) + " MB" : kb + " KB"} · ${input.fileName.split(".").pop()?.toUpperCase() ?? "FILE"}`, kind: input.kind, url: input.url };
      l.resources.push(r);
      l.updatedAt = nowIso();
      commit();
      return r;
    });
  },

  removeResource(lessonId: string, resourceId: string) {
    return request<{ ok: true }>("DELETE", `/instructor/lessons/${lessonId}/resources/${resourceId}`, undefined, () => {
      const { l } = ownLesson(lessonId);
      l.resources = l.resources.filter((r) => r.id !== resourceId);
      commit();
      return { ok: true as const };
    });
  },

  set(setId: string) {
    return request<{ set: PracticeSet; lesson: Lesson | null; course: Course }>("GET", `/instructor/practice-sets/${setId}`, undefined, () => {
      const { c, s } = ownSet(setId);
      return { set: s, lesson: db().lessons.find((l) => l.id === s.lessonId) ?? null, course: c };
    });
  },

  updateSet(setId: string, patch: { title?: string; minutes?: number; passage?: Passage }) {
    return request<PracticeSet>("PATCH", `/instructor/practice-sets/${setId}`, patch, () => {
      const { s } = ownSet(setId);
      validate({ minutes: patch.minutes !== undefined && (patch.minutes < 1 || patch.minutes > 90) && "Time limit must be 1–90 minutes." });
      Object.assign(s, patch);
      commit();
      return s;
    });
  },

  upsertQuestion(setId: string, q: Omit<Question, "id" | "passageId"> & { id?: string }) {
    return request<Question>("PUT", `/instructor/practice-sets/${setId}/questions${q.id ? "/" + q.id : ""}`, q, () => {
      const { s } = ownSet(setId);
      const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
      validate({
        prompt: q.prompt.trim().length < 3 && "Write the question.",
        options: (q.type === "mcq" || q.type === "heading") && opts.length < 2 && "Add at least two options.",
        answerKey: !q.answerKey.trim() ? "Set the correct answer." : (q.type === "mcq" || q.type === "heading") && !(Number(q.answerKey) >= 0 && Number(q.answerKey) < opts.length) && "Choose which option is correct.",
        explanation: q.explanation.trim().length < 5 && "Explain the answer — learners see this after submitting.",
        skills: !q.skills.length && "Tag at least one micro-skill (Q-matrix).",
        gap: q.type === "gap" && !q.prompt.includes("___") && "Mark the gap in the sentence with ___.",
      });
      const clean: Question = { ...q, options: q.type === "mcq" || q.type === "heading" ? opts : undefined, id: q.id ?? `${setId}-q${uid("")}`, passageId: setId };
      const i = s.questions.findIndex((x) => x.id === q.id);
      if (i >= 0) s.questions[i] = clean; else s.questions.push(clean);
      commit();
      return clean;
    });
  },

  deleteQuestion(setId: string, questionId: string) {
    return request<{ ok: true }>("DELETE", `/instructor/practice-sets/${setId}/questions/${questionId}`, undefined, () => {
      const { s } = ownSet(setId);
      s.questions = s.questions.filter((q) => q.id !== questionId);
      commit();
      return { ok: true as const };
    });
  },

  questionBank(params: { courseId?: string; skillId?: string; q?: string } = {}) {
    return request<BankQuestion[]>("GET", `/instructor/questions${qs(params)}`, undefined, () => {
      const u = requireUser(["instructor", "admin"]);
      const d = db();
      const courses = d.courses.filter((c) => canManageCourse(u, c) && (!params.courseId || c.id === params.courseId));
      const ids = new Set(courses.map((c) => c.id));
      const stats = new Map<string, { n: number; ok: number }>();
      for (const a of d.attempts) for (const r of a.responses) { const s = stats.get(r.questionId) ?? { n: 0, ok: 0 }; s.n++; if (r.isCorrect) s.ok++; stats.set(r.questionId, s); }
      const q = (params.q ?? "").toLowerCase();
      return d.practiceSets
        .filter((s) => s.courseId && ids.has(s.courseId))
        .flatMap((s) => {
          const l = d.lessons.find((x) => x.id === s.lessonId);
          const c = courses.find((x) => x.id === s.courseId)!;
          return s.questions.map((qq) => {
            const st = stats.get(qq.id);
            return { ...qq, setId: s.id, setCode: s.code, setTitle: s.title, lessonId: s.lessonId, lessonTitle: l?.title ?? "", courseId: c.id, courseTitle: c.title, skill: s.skill, responses: st?.n ?? 0, pctCorrect: st?.n ? Math.round((st.ok / st.n) * 100) : null };
          });
        })
        .filter((x) => (!params.skillId || x.skills.some((s) => s.skillId === params.skillId)) && (!q || x.prompt.toLowerCase().includes(q) || x.setTitle.toLowerCase().includes(q)));
    });
  },

  submissions(params: { status?: "submitted" | "graded"; assignmentId?: string } = {}) {
    return request<(Submission & { assignment: Assignment; courseTitle: string })[]>("GET", `/instructor/submissions${qs(params)}`, undefined, () => {
      const u = requireUser(["instructor", "admin"]);
      const d = db();
      return d.submissions
        .map((s) => ({ s, a: d.assignments.find((a) => a.id === s.assignmentId)! }))
        .filter(({ s, a }) => a && canManageCourse(u, courseById(a.courseId)!) && (!params.status || s.status === params.status) && (!params.assignmentId || a.id === params.assignmentId))
        .sort((x, y) => Number(x.s.status === "graded") - Number(y.s.status === "graded") || y.s.submittedAt.localeCompare(x.s.submittedAt))
        .map(({ s, a }) => ({ ...s, assignment: a, courseTitle: courseById(a.courseId)?.title ?? "" }));
    });
  },

  grade(submissionId: string, scores: Record<string, number>, feedback: string) {
    return request<Submission>("POST", `/instructor/submissions/${submissionId}/grade`, { scores, feedback }, () => {
      const u = requireUser(["instructor", "admin"]);
      const d = db();
      const s = d.submissions.find((x) => x.id === submissionId);
      if (!s) throw new ApiError(404, "NOT_FOUND", "Submission not found.");
      const a = d.assignments.find((x) => x.id === s.assignmentId)!;
      if (!canManageCourse(u, courseById(a.courseId)!)) throw new ApiError(403, "FORBIDDEN", "You can only grade your own courses.");
      const missing = a.rubric.filter((r) => !(scores[r.criterion] >= 0 && scores[r.criterion] <= 9));
      validate({ scores: missing.length > 0 && `Score every criterion (0–9): ${missing.map((m) => m.criterion).join(", ")}.`, feedback: feedback.trim().length < 10 && "Write feedback the learner can act on (10+ characters)." });
      s.scores = scores;
      s.band = overallBand(Object.values(scores));
      s.feedback = feedback.trim();
      s.status = "graded";
      s.gradedBy = u.id;
      s.gradedAt = nowIso();
      notify(s.userId, { type: "result", title: `${a.task} graded: Band ${s.band.toFixed(1)}`, body: `${u.name} graded “${a.title}”.`, link: `/assignments/${a.id}` });
      commit();
      return s;
    });
  },

  createAssignment(courseId: string, input: Omit<Assignment, "id" | "courseId">) {
    return request<Assignment>("POST", `/instructor/courses/${courseId}/assignments`, input, () => {
      const { c } = ownCourse(courseId);
      validate({ title: input.title.trim().length < 4 && "Add a title.", prompt: input.prompt.trim().length < 20 && "Write the full task prompt.", dueAt: isNaN(Date.parse(input.dueAt)) && "Set a due date." });
      const a: Assignment = { ...input, id: uid("asg"), courseId: c.id };
      db().assignments.push(a);
      for (const e of db().enrollments.filter((x) => x.courseId === c.id && x.status === "active"))
        notify(e.userId, { type: "deadline", title: "New writing task", body: `${a.title} is due ${new Date(a.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`, link: `/assignments/${a.id}` });
      commit();
      return a;
    });
  },

  learners(courseId: string) {
    return request<LearnerRow[]>("GET", `/instructor/courses/${courseId}/learners`, undefined, () => {
      const { c } = ownCourse(courseId);
      return db().enrollments.filter((e) => e.courseId === c.id && e.status !== "left").map((e) => learnerRisk(e.userId, c.id)!).filter(Boolean)
        .sort((a, b) => ["at_risk", "watch", "on_track"].indexOf(a.risk) - ["at_risk", "watch", "on_track"].indexOf(b.risk) || a.pct - b.pct);
    });
  },

  analytics(courseId: string) {
    return request<{ sets: { id: string; code: string; title: string; skill: SkillCategory; attempts: number; avgPct: number | null }[]; hardest: { id: string; prompt: string; setCode: string; pctCorrect: number; responses: number }[]; completionRate: number; avgProgress: number; learners: number; skillMastery: { skillId: string; name: string; avg: number }[] }>("GET", `/instructor/courses/${courseId}/analytics`, undefined, () => {
      const { c } = ownCourse(courseId);
      const d = db();
      const ls = lessonsOf(c.id, true);
      const sets = ls.map((l) => setOf(l.practiceSetId)!).filter(Boolean);
      const atts = d.attempts.filter((a) => a.status === "submitted" && sets.some((s) => s.id === a.quizId));
      const qStats = new Map<string, { n: number; ok: number }>();
      for (const a of atts) for (const r of a.responses) { const s = qStats.get(r.questionId) ?? { n: 0, ok: 0 }; s.n++; if (r.isCorrect) s.ok++; qStats.set(r.questionId, s); }
      const ens = d.enrollments.filter((e) => e.courseId === c.id && e.status !== "left");
      const learnerIds = new Set(ens.map((e) => e.userId));
      const skillMastery = d.skills.map((s) => {
        const rows = d.mastery.filter((m) => m.skillId === s.id && learnerIds.has(m.userId));
        return { skillId: s.id, name: s.name, avg: rows.length ? rows.reduce((t, r) => t + r.masteryProb, 0) / rows.length : 0 };
      }).sort((a, b) => a.avg - b.avg);
      return {
        sets: sets.map((s) => { const as = atts.filter((a) => a.quizId === s.id); return { id: s.id, code: s.code, title: s.title, skill: s.skill, attempts: as.length, avgPct: as.length ? Math.round((as.reduce((t, a) => t + a.totalScore / a.maxScore, 0) / as.length) * 100) : null }; }),
        hardest: sets.flatMap((s) => s.questions.map((q) => ({ q, s }))).map(({ q, s }) => { const st = qStats.get(q.id); return { id: q.id, prompt: q.prompt, setCode: s.code, pctCorrect: st?.n ? Math.round((st.ok / st.n) * 100) : -1, responses: st?.n ?? 0 }; }).filter((x) => x.responses >= 3).sort((a, b) => a.pctCorrect - b.pctCorrect).slice(0, 6),
        completionRate: ens.length ? Math.round((ens.filter((e) => e.status === "completed").length / ens.length) * 100) : 0,
        avgProgress: ens.length ? Math.round(ens.reduce((t, e) => t + progressOf(e).pct, 0) / ens.length) : 0,
        learners: ens.length, skillMastery,
      };
    });
  },
};
