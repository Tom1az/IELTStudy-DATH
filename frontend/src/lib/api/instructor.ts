import type {
  BackendAnswerKey, BackendCourse, BackendCourseLevel, BackendLesson, BackendLessonDetail, BackendPassage, BackendQuestion, BackendQuestionOptions,
  BackendQuestionType, BackendQuiz, BackendSkill,
} from "./backend-types";
import { ApiError, backendRequest } from "./client";
import type { Course, SkillCategory } from "@/lib/types";
import { lessonCategory, toCourse, toSkillCategories, type SkillCategories } from "./mappers";

/**
 * Instructor Studio: courses and the review flow, lessons, passages and media, questions
 * and quizzes. The studio components (`components/studio`) work with the backend shapes
 * directly, because they edit them. The rules behind the 403 / 409 errors are in
 * `backend/src/docs/openapi.yaml`.
 */

/** A course in the studio list, with its core lessons counted per skill. */
export interface StudioCourse extends Course {
  lessonCount: number;
  skillCounts: Record<SkillCategory, number>;
}

export interface SkillWeightInput {
  skillId: number;
  weight: number;
}

export interface LessonInput {
  title: string;
  content: string | null;
  kind: "core" | "remedial";
  orderIndex: number;
  skills: SkillWeightInput[];
}

export interface PassageInput {
  lessonId: number;
  type: BackendPassage["type"];
  title: string | null;
  content: string | null;
  mediaPath: string | null;
}

export interface QuestionInput {
  passageId: number | null;
  questionType: BackendQuestionType;
  questionText: string;
  options: BackendQuestionOptions;
  answerKey: BackendAnswerKey;
  explanation: string | null;
  difficulty: number;
  skills: SkillWeightInput[];
}

/** Content can only change while the course is a draft or was rejected (API rule, 409 otherwise). */
export const isEditable = (course: BackendCourse) => course.status === "draft" || course.status === "rejected";

async function loadCategories(): Promise<SkillCategories> {
  const res = await backendRequest<{ skills: BackendSkill[] }>("GET", "/skills");
  return toSkillCategories(res.skills);
}

/**
 * The quiz's question ids as the server has them now. Changing a quiz sends the whole
 * list, so it is built from this fresh copy, not from a quiz the page loaded earlier
 * (which may miss questions added since).
 */
async function currentQuestionIds(quizId: number): Promise<number[]> {
  const res = await backendRequest<{ quiz: BackendQuiz }>("GET", `/quizzes/${quizId}`);
  return res.quiz.questions.map((q) => q.questionId);
}

async function loadLessons(courseId: number | string): Promise<BackendLesson[]> {
  const res = await backendRequest<{ lessons: BackendLesson[] }>("GET", `/courses/${courseId}/lessons`);
  return res.lessons;
}

export const instructorApi = {
  /* ───────── Courses ───────── */

  /** My courses, for the studio list and overview. */
  async listCourses(): Promise<StudioCourse[]> {
    const [res, categories] = await Promise.all([backendRequest<{ courses: BackendCourse[] }>("GET", "/instructor/courses"), loadCategories()]);
    const lessonLists = await Promise.all(res.courses.map((c) => loadLessons(c.courseId)));
    const list: StudioCourse[] = [];
    for (let i = 0; i < res.courses.length; i++) {
      const counts: Record<SkillCategory, number> = { listening: 0, reading: 0, writing: 0, speaking: 0 };
      for (const lesson of lessonLists[i]) {
        if (lesson.kind === "core") counts[lessonCategory(lesson, categories)] += 1;
      }
      list.push({ ...toCourse(res.courses[i]), lessonCount: res.courses[i].lessonCount, skillCounts: counts });
    }
    return list;
  },

  async getCourse(courseId: string) {
    const [course, lessons, categories] = await Promise.all([
      backendRequest<{ course: BackendCourse }>("GET", `/courses/${courseId}`).then((r) => r.course),
      loadLessons(courseId),
      loadCategories(),
    ]);
    return { course, lessons, categories };
  },

  async createCourse(input: { title: string; description: string | null; targetLevel: BackendCourseLevel }) {
    const res = await backendRequest<{ course: BackendCourse }>("POST", "/courses", input);
    return res.course;
  },

  async updateCourse(courseId: number, patch: { title?: string; description?: string | null; targetLevel?: BackendCourseLevel }) {
    const res = await backendRequest<{ course: BackendCourse }>("PATCH", `/courses/${courseId}`, patch);
    return res.course;
  },

  /** The review flow: submit (draft/rejected → pending_review), withdraw (back to draft), archive. */
  async changeStatus(courseId: number, action: "submit" | "withdraw" | "archive") {
    const res = await backendRequest<{ course: BackendCourse }>("POST", `/courses/${courseId}/${action}`);
    return res.course;
  },

  async deleteCourse(courseId: number) {
    await backendRequest("DELETE", `/courses/${courseId}`);
  },

  /* ───────── Lessons ───────── */

  async createLesson(courseId: number, input: LessonInput) {
    const res = await backendRequest<{ lesson: BackendLessonDetail }>("POST", `/courses/${courseId}/lessons`, input);
    return res.lesson;
  },

  async updateLesson(lessonId: number, patch: Partial<LessonInput>) {
    const res = await backendRequest<{ lesson: BackendLessonDetail }>("PATCH", `/lessons/${lessonId}`, patch);
    return res.lesson;
  },

  async deleteLesson(lessonId: number) {
    await backendRequest("DELETE", `/lessons/${lessonId}`);
  },

  /**
   * Moves a lesson up or down by swapping `orderIndex` with its neighbour. These are two
   * separate requests; if the second one fails, the page reloads and shows the real order.
   */
  async swapOrder(a: BackendLesson, b: BackendLesson) {
    await backendRequest("PATCH", `/lessons/${a.lessonId}`, { orderIndex: b.orderIndex });
    await backendRequest("PATCH", `/lessons/${b.lessonId}`, { orderIndex: a.orderIndex });
  },

  /** The lesson editor: the lesson, its course, and the author view of each of its quizzes. */
  async getLesson(lessonId: string) {
    const lesson = (await backendRequest<{ lesson: BackendLessonDetail }>("GET", `/lessons/${lessonId}`)).lesson;
    const [course, quizzes] = await Promise.all([
      backendRequest<{ course: BackendCourse }>("GET", `/courses/${lesson.courseId}`).then((r) => r.course),
      Promise.all(lesson.quizzes.map((q) => backendRequest<{ quiz: BackendQuiz }>("GET", `/quizzes/${q.quizId}`).then((r) => r.quiz))),
    ]);
    return { lesson, course, quizzes };
  },

  /* ───────── Passages and media ───────── */

  /**
   * Uploads an audio or video file in two steps: the API returns a signed Storage URL,
   * then the browser `PUT`s the file straight to it. Returns the Storage path to save as
   * the passage's `mediaPath`.
   */
  async uploadMedia(file: File): Promise<string> {
    const ticket = await backendRequest<{ upload: { uploadUrl: string; path: string } }>("POST", "/uploads", { fileName: file.name, contentType: file.type });
    const put = await fetch(ticket.upload.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!put.ok) throw new ApiError(put.status, `HTTP_${put.status}`, "The file upload failed. Try again.");
    return ticket.upload.path;
  },

  async createPassage(input: PassageInput) {
    const res = await backendRequest<{ passage: BackendPassage }>("POST", "/passages", input);
    return res.passage;
  },

  async updatePassage(passageId: number, patch: Partial<Omit<PassageInput, "lessonId">>) {
    const res = await backendRequest<{ passage: BackendPassage }>("PATCH", `/passages/${passageId}`, patch);
    return res.passage;
  },

  async deletePassage(passageId: number) {
    await backendRequest("DELETE", `/passages/${passageId}`);
  },

  /* ───────── Questions and quizzes ───────── */

  async listQuestions(params: { skillId?: string; type?: BackendQuestionType }) {
    const query = new URLSearchParams();
    if (params.skillId) query.set("skillId", params.skillId);
    if (params.type) query.set("type", params.type);
    const qs = query.toString();
    const res = await backendRequest<{ questions: BackendQuestion[] }>("GET", `/questions${qs ? `?${qs}` : ""}`);
    return res.questions;
  },

  async createQuestion(input: QuestionInput) {
    const res = await backendRequest<{ question: BackendQuestion }>("POST", "/questions", input);
    return res.question;
  },

  async updateQuestion(questionId: number, patch: Partial<QuestionInput>) {
    const res = await backendRequest<{ question: BackendQuestion }>("PATCH", `/questions/${questionId}`, patch);
    return res.question;
  },

  /**
   * A new question is written and then added to a quiz. A quiz needs at least one
   * question, so the lesson's first question creates the quiz itself.
   */
  async addQuestionToLesson(lesson: BackendLessonDetail, quiz: BackendQuiz | null, input: QuestionInput) {
    const question = await instructorApi.createQuestion(input);
    if (quiz) {
      const ids = await currentQuestionIds(quiz.quizId);
      ids.push(question.questionId);
      await backendRequest("PATCH", `/quizzes/${quiz.quizId}`, { questionIds: ids });
    } else {
      await backendRequest("POST", "/quizzes", { kind: "lesson", lessonId: lesson.lessonId, title: `${lesson.title} check`, timeLimitSeconds: null, questionIds: [question.questionId] });
    }
    return question;
  },

  /**
   * Takes a question out of its quiz, then deletes it. A quiz can't be empty, so removing
   * its last question deletes the quiz. Both fail with 409 once learners have used them.
   */
  async removeQuestion(quiz: BackendQuiz, questionId: number) {
    const ids = (await currentQuestionIds(quiz.quizId)).filter((id) => id !== questionId);
    if (ids.length === 0) await backendRequest("DELETE", `/quizzes/${quiz.quizId}`);
    else await backendRequest("PATCH", `/quizzes/${quiz.quizId}`, { questionIds: ids });
    await backendRequest("DELETE", `/questions/${questionId}`);
  },

  async updateQuiz(quizId: number, patch: { title?: string; timeLimitSeconds?: number | null }) {
    const res = await backendRequest<{ quiz: BackendQuiz }>("PATCH", `/quizzes/${quizId}`, patch);
    return res.quiz;
  },
};
