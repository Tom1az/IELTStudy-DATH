import type { Course, Enrollment, Lesson, Paginated, Recommendation, Skill, SkillCategory, User } from "@/lib/types";
import type {
  BackendAttemptSummary, BackendCourse, BackendEnrollment, BackendLesson, BackendLessonDetail, BackendRecommendation, BackendSkill,
} from "./backend-types";
import { ApiError, backendRequest, getToken } from "./client";
import { authApi } from "./auth";
import {
  buildSyllabus, lessonCategory, toCourse, toEnrollment, toLesson, toRecommendation, toSkill, toSkillCategories, type SkillCategories,
} from "./mappers";

/**
 * Catalog, lessons and the learner dashboard. Each call builds the shape a page needs
 * from the endpoints in `backend/src/docs/openapi.yaml`. Decisions:
 * `docs/plans/phase-4-frontend.md`.
 */

/* ───────── DTOs ───────── */

export interface CourseSummary extends Course {
  lessonCount: number;
  skillCounts: Record<SkillCategory, number>;
  instructorName: string;
  enrollment: { status: Enrollment["status"]; pct: number } | null;
}

export interface LessonHit {
  lessonId: string;
  courseId: string;
  courseLevel: number;
  courseLevelName: string;
  skill: SkillCategory;
  order: number;
  title: string;
}

export interface SyllabusLesson {
  id: string;
  title: string;
  order: number;
  completed: boolean;
  unlocked: boolean;
}

export interface SyllabusSection {
  skill: SkillCategory;
  done: number;
  total: number;
  lessons: SyllabusLesson[];
}

export interface CourseDetail {
  course: CourseSummary;
  sections: SyllabusSection[];
  enrollment: Enrollment | null;
  canEnroll: { ok: boolean; reason?: string };
}

/** A reading text, recording or video inside a lesson. */
export interface LessonPassage {
  id: string;
  type: "reading_text" | "listening_audio" | "video";
  title: string | null;
  content: string | null;
  mediaUrl: string | null;
}

export interface LessonView {
  course: Course;
  lesson: Lesson;
  passages: LessonPassage[];
  sections: SyllabusSection[];
  enrollment: Enrollment | null;
  progress: { done: number; total: number; pct: number };
  practice: { id: string; title: string; questions: number; minutes: number } | null;
  unlocked: boolean;
  prevId?: string;
  nextId?: string;
}

export interface DashboardData {
  user: User;
  continue: { courseId: string; courseTitle: string; lessonId: string; lessonTitle: string; skill: SkillCategory; order: number; skillTotal: number; pct: number } | null;
  /** Estimated band per skill. Null until BKT mastery exists (Phase 3). */
  bands: Record<SkillCategory, number> | null;
  overall: number | null;
  courses: { course: Course; status: Enrollment["status"]; perSkill: { skill: SkillCategory; done: number; total: number }[]; pct: number }[];
  /** Null while `GET /recommendations` is not built (Phase 3). */
  upNext: Recommendation[] | null;
  recent: { attemptId: string; quizId: string; title: string; score: number; max: number; completedAt: string }[];
  inProgressAttempt?: { quizId: string; total: number };
}

/* ───────── Shared loaders ───────── */

// The skill taxonomy is read-only, so it is loaded once per page load
let skillsCache: BackendSkill[] | null = null;

async function loadSkills(): Promise<BackendSkill[]> {
  if (!skillsCache) {
    const res = await backendRequest<{ skills: BackendSkill[] }>("GET", "/skills");
    skillsCache = res.skills;
  }
  return skillsCache;
}

async function loadCategories(): Promise<SkillCategories> {
  return toSkillCategories(await loadSkills());
}

async function loadCourse(courseId: string): Promise<BackendCourse> {
  const res = await backendRequest<{ course: BackendCourse }>("GET", `/courses/${courseId}`);
  return res.course;
}

async function loadLessons(courseId: string | number): Promise<BackendLesson[]> {
  const res = await backendRequest<{ lessons: BackendLesson[] }>("GET", `/courses/${courseId}/lessons`);
  return res.lessons;
}

/** Done / total / percent over a course's core lessons. */
function coreProgress(lessons: BackendLesson[]) {
  const core = lessons.filter((l) => l.kind === "core");
  const done = core.filter((l) => l.progress?.status === "completed").length;
  return { done, total: core.length, pct: core.length ? Math.round((done / core.length) * 100) : 0 };
}

/** The four skill sections of a course, in the shape the syllabus and lesson sidebar use. */
function syllabusSections(lessons: BackendLesson[], categories: SkillCategories): SyllabusSection[] {
  const sections: SyllabusSection[] = [];
  for (const section of buildSyllabus(lessons, categories)) {
    const items: SyllabusLesson[] = [];
    for (const entry of section.entries) {
      items.push({
        id: String(entry.lesson.lessonId),
        title: entry.lesson.title,
        order: entry.order,
        completed: entry.lesson.progress?.status === "completed",
        // `locked` is only sent to learners; staff can open every lesson
        unlocked: !entry.lesson.locked,
      });
    }
    const done = items.filter((l) => l.completed).length;
    sections.push({ skill: section.skill, done, total: items.length, lessons: items });
  }
  return sections;
}

function skillCounts(lessons: BackendLesson[], categories: SkillCategories): Record<SkillCategory, number> {
  const counts: Record<SkillCategory, number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
  for (const lesson of lessons) {
    if (lesson.kind === "core") counts[lessonCategory(lesson, categories)] += 1;
  }
  return counts;
}

function summarize(course: BackendCourse, lessons: BackendLesson[], categories: SkillCategories): CourseSummary {
  let enrollment: CourseSummary["enrollment"] = null;
  if (course.isEnrolled) {
    const progress = coreProgress(lessons);
    const completed = progress.total > 0 && progress.done === progress.total;
    enrollment = { status: completed ? "completed" : "active", pct: progress.pct };
  }
  return {
    ...toCourse(course),
    lessonCount: course.lessonCount,
    skillCounts: skillCounts(lessons, categories),
    instructorName: course.instructor.fullName,
    enrollment,
  };
}

/** `GET /recommendations` is built in Phase 3. Until then it is a 404, and the dashboard says so. */
async function loadRecommendations(categories: SkillCategories): Promise<Recommendation[] | null> {
  try {
    const res = await backendRequest<{ recommendations: BackendRecommendation[] }>("GET", "/recommendations");
    return res.recommendations.map((r) => toRecommendation(r, categories));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/* ───────── Catalog ───────── */

export const catalogApi = {
  /** The course catalog, plus a search over lesson titles (by text and/or skill), paged. */
  async list(params: { q?: string; skill?: SkillCategory | "all"; page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = params.pageSize ?? 8;
    const emptyHits: Paginated<LessonHit> = { items: [], page, pageSize, total: 0, totalPages: 1 };

    // The catalog needs a token (only /auth/* is public), so logged-out visitors see no courses
    if (!getToken()) return { courses: [] as CourseSummary[], lessons: emptyHits };

    const [res, categories] = await Promise.all([backendRequest<{ courses: BackendCourse[] }>("GET", "/courses"), loadCategories()]);
    // One lesson list per course, to count lessons per skill and to search lesson titles
    const lessonLists = await Promise.all(res.courses.map((c) => loadLessons(c.courseId)));

    const q = (params.q ?? "").trim().toLowerCase();
    const skill = params.skill && params.skill !== "all" ? params.skill : undefined;
    const courses: CourseSummary[] = [];
    const hits: LessonHit[] = [];

    for (let i = 0; i < res.courses.length; i++) {
      const summary = summarize(res.courses[i], lessonLists[i], categories);
      if (skill && summary.skillCounts[skill] === 0) continue;
      courses.push(summary);
      if (!q && !skill) continue;
      for (const section of buildSyllabus(lessonLists[i], categories)) {
        if (skill && section.skill !== skill) continue;
        for (const entry of section.entries) {
          if (q && !entry.lesson.title.toLowerCase().includes(q)) continue;
          hits.push({
            lessonId: String(entry.lesson.lessonId),
            courseId: summary.id,
            courseLevel: summary.level,
            courseLevelName: summary.levelName,
            skill: section.skill,
            order: entry.order,
            title: entry.lesson.title,
          });
        }
      }
    }
    courses.sort((a, b) => a.level - b.level);

    const lessons: Paginated<LessonHit> = {
      items: hits.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: hits.length,
      totalPages: Math.max(1, Math.ceil(hits.length / pageSize)),
    };
    return { courses, lessons };
  },

  /** The micro-skill taxonomy. */
  async skills(): Promise<Skill[]> {
    const skills = await loadSkills();
    return skills.map(toSkill);
  },

  async get(courseId: string): Promise<CourseDetail> {
    const [course, lessons, categories] = await Promise.all([loadCourse(courseId), loadLessons(courseId), loadCategories()]);
    return {
      course: summarize(course, lessons, categories),
      sections: syllabusSections(lessons, categories),
      enrollment: course.isEnrolled ? toEnrollment({ courseId: course.courseId, lessons }) : null,
      // The backend only sends `isEnrolled` to learners, so its absence means a staff account
      canEnroll: course.isEnrolled === undefined ? { ok: false, reason: "Only learner accounts can enroll." } : { ok: true },
    };
  },

  async enroll(courseId: string): Promise<Enrollment> {
    const res = await backendRequest<{ enrollment: BackendEnrollment }>("POST", `/courses/${courseId}/enroll`);
    const e = res.enrollment;
    // Lesson progress isn't part of the enrolment response; pages reload the course after enrolling
    return toEnrollment({ courseId: e.course.courseId, lessons: [], enrolledAt: e.enrolledAt, completedAt: e.completedAt });
  },
};

/* ───────── Lessons ───────── */

export const lessonApi = {
  /**
   * The lesson page: the lesson itself (`GET /lessons/:id`), the course and its lesson
   * list for the sidebar. A learner opening a lesson for the first time is marked as
   * started (`in_progress`). It is never sent again, because that would undo `completed`.
   */
  async get(courseId: string, lessonId: string): Promise<LessonView> {
    const [detail, course, lessons, categories] = await Promise.all([
      backendRequest<{ lesson: BackendLessonDetail }>("GET", `/lessons/${lessonId}`).then((r) => r.lesson),
      loadCourse(courseId),
      loadLessons(courseId),
      loadCategories(),
    ]);

    if (course.isEnrolled && detail.progress === null) {
      await backendRequest("PUT", `/lessons/${lessonId}/progress`, { status: "in_progress" }).catch(() => {});
    }

    const sections = syllabusSections(lessons, categories);
    const flat = sections.flatMap((s) => s.lessons);
    const index = flat.findIndex((l) => l.id === lessonId);
    // Remedial lessons are not in the syllabus, so they have no position
    const order = index >= 0 ? flat[index].order : 1;
    const passages: LessonPassage[] = detail.passages.map((p) => ({ id: String(p.passageId), type: p.type, title: p.title, content: p.content, mediaUrl: p.mediaUrl }));
    const quiz = detail.quizzes[0];

    return {
      course: toCourse(course),
      lesson: toLesson(detail, lessonCategory(detail, categories), order),
      passages,
      sections,
      enrollment: course.isEnrolled ? toEnrollment({ courseId: course.courseId, lessons }) : null,
      progress: coreProgress(lessons),
      practice: quiz ? { id: String(quiz.quizId), title: quiz.title, questions: quiz.questionCount, minutes: quiz.timeLimitSeconds ? Math.round(quiz.timeLimitSeconds / 60) : 0 } : null,
      unlocked: !detail.locked,
      prevId: index > 0 ? flat[index - 1].id : undefined,
      nextId: index >= 0 && index < flat.length - 1 ? flat[index + 1].id : undefined,
    };
  },

  async complete(lessonId: string, courseId: string) {
    await backendRequest("PUT", `/lessons/${lessonId}/progress`, { status: "completed" });
    const enrollment = toEnrollment({ courseId: Number(courseId), lessons: await loadLessons(courseId) });
    return { enrollment, courseCompleted: enrollment.status === "completed" };
  },
};

/* ───────── Dashboard ───────── */

export const meApi = {
  async dashboard(): Promise<DashboardData> {
    const [user, enrollmentsRes, attemptsRes, categories] = await Promise.all([
      authApi.me(),
      backendRequest<{ enrollments: BackendEnrollment[] }>("GET", "/me/enrollments"),
      backendRequest<{ attempts: BackendAttemptSummary[] }>("GET", "/me/attempts"),
      loadCategories(),
    ]);
    if (!user) throw new ApiError(401, "HTTP_401", "Please log in");
    const upNext = await loadRecommendations(categories);

    const enrollments = enrollmentsRes.enrollments;
    const lessonLists = await Promise.all(enrollments.map((e) => loadLessons(e.course.courseId)));

    const courses: DashboardData["courses"] = [];
    for (let i = 0; i < enrollments.length; i++) {
      const perSkill = syllabusSections(lessonLists[i], categories).map((s) => ({ skill: s.skill, done: s.done, total: s.total }));
      courses.push({
        course: toCourse(enrollments[i].course),
        status: enrollments[i].completedAt ? "completed" : "active",
        perSkill,
        pct: Math.round(enrollments[i].progressPercent),
      });
    }
    // Courses in progress first, then the highest level
    courses.sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || b.course.level - a.course.level);

    // "Continue learning": the most recent unfinished course, at its first unfinished lesson
    let cont: DashboardData["continue"] = null;
    let newest = -1;
    for (let i = 0; i < enrollments.length; i++) {
      if (enrollments[i].completedAt) continue;
      if (newest === -1 || enrollments[i].enrolledAt > enrollments[newest].enrolledAt) newest = i;
    }
    if (newest >= 0) {
      const e = enrollments[newest];
      for (const section of syllabusSections(lessonLists[newest], categories)) {
        const next = section.lessons.find((l) => !l.completed);
        if (next) {
          cont = {
            courseId: String(e.course.courseId),
            courseTitle: e.course.title,
            lessonId: next.id,
            lessonTitle: next.title,
            skill: section.skill,
            order: next.order,
            skillTotal: section.total,
            pct: Math.round(e.progressPercent),
          };
          break;
        }
      }
    }

    // `/me/attempts` is newest first. The diagnostic has its own page, so it is left out here.
    const practiceAttempts = attemptsRes.attempts.filter((a) => a.quiz.kind !== "diagnostic");
    const recent: DashboardData["recent"] = [];
    for (const a of practiceAttempts) {
      if (a.status !== "completed" || recent.length === 4) continue;
      recent.push({ attemptId: String(a.attemptId), quizId: String(a.quizId), title: a.quiz.title, score: a.totalScore ?? 0, max: a.maxScore, completedAt: a.completedAt ?? a.startedAt });
    }
    const live = practiceAttempts.find((a) => a.status === "in_progress");

    return {
      user,
      continue: cont,
      bands: null,
      overall: null,
      courses,
      upNext,
      recent,
      inProgressAttempt: live ? { quizId: String(live.quizId), total: live.maxScore } : undefined,
    };
  },

  /** Records that I opened a recommendation (used for the Precision@3 / MRR evaluation). */
  async clickRecommendation(recommendationId: string) {
    await backendRequest("POST", `/recommendations/${recommendationId}/click`);
  },
};
