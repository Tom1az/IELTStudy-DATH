// Access rules for quizzes, used by controllers/quizzes.ts. They come from the API contract and
// docs/ERD.md ("Content edit rights", "Locked content").
import { db } from "../prisma/db.ts";
import { httpError } from "../utils/http-error.ts";
import type { PublicUser } from "../utils/public-user.ts";
import { assertCanStudy, assertEditable, canSeeCourse, isCourseOwner } from "./courses.ts";
import type { CourseRow } from "./courses.ts";

const orm = db.orm.public;

// The model collections we write to. Inside a transaction we use tx.orm.public, which has the same type.
type Orm = typeof db.orm.public;

export type QuizKind = "diagnostic" | "lesson" | "practice";

// A quiz row as the database returns it
export type QuizRow = {
  quizId: number;
  kind: QuizKind;
  lessonId: number | null;
  createdById: number;
  title: string;
  description: string | null;
  timeLimitSeconds: number | null;
};

// "author" includes answers, explanations and skill weights; "learner" leaves them out
export type QuizView = "author" | "learner";

// Loads a quiz and the course of its lesson (null for the diagnostic, which has no lesson).
// A quiz in a course the user may not see gets the same 404 as a missing one.
export const findVisibleQuiz = async (quizId: number, user: PublicUser) => {
  const quiz = await orm.Quizzes.first({ quizId });
  if (!quiz) {
    throw httpError(404, "Quiz not found");
  }
  if (quiz.lessonId === null) {
    return { quiz, course: null };
  }

  const lesson = await orm.Lessons.first({ lessonId: quiz.lessonId });
  const course = lesson ? await orm.Courses.first({ courseId: lesson.courseId }) : null;
  if (!course || !canSeeCourse(course, user)) {
    throw httpError(404, "Quiz not found");
  }
  return { quiz, course };
};

// Who sees the answers: the quiz's creator, the instructor who owns its course, and admins
const isQuizAuthor = (quiz: QuizRow, course: CourseRow | null, user: PublicUser) => {
  if (user.role === "admin") return true;
  if (quiz.createdById === user.userId) return true;
  return course !== null && isCourseOwner(course, user);
};

// Loads a quiz for GET /quizzes/{id} and decides which view the caller gets. Everyone who isn't
// an author gets the learner view, with the same rule as opening the quiz's lesson: learners
// must be enrolled. Anyone may see the diagnostic's learner view.
export const findQuizForViewer = async (quizId: number, user: PublicUser) => {
  const { quiz, course } = await findVisibleQuiz(quizId, user);

  let view: QuizView = "author";
  if (!isQuizAuthor(quiz, course, user)) {
    if (course !== null) {
      await assertCanStudy(course, user);
    }
    view = "learner";
  }
  return { quiz, view };
};

// Quizzes are edited by their creator or an admin (docs/ERD.md, "Content edit rights")
export const findOwnQuiz = async (quizId: number, user: PublicUser) => {
  const { quiz, course } = await findVisibleQuiz(quizId, user);
  if (user.role !== "admin" && quiz.createdById !== user.userId) {
    throw httpError(403, "Only the quiz's creator or an admin can do this");
  }
  return { quiz, course };
};

// Locked content: a quiz changes only while its course is draft or rejected (the diagnostic has
// no course), and never once learners have attempted it
export const assertQuizEditable = async (quiz: QuizRow, course: CourseRow | null) => {
  if (course !== null) {
    assertEditable(course);
  }
  const attempt = await orm.QuizAttempts.where({ quizId: quiz.quizId }).first();
  if (attempt) {
    throw httpError(409, "Learners have attempted this quiz");
  }
};

// Every question must exist (400 otherwise), and instructors may only use questions they created
export const assertCanUseQuestions = async (questionIds: number[], user: PublicUser) => {
  const questions = await orm.Questions.where((q) => q.questionId.in(questionIds))
    .select("questionId", "createdById")
    .all();

  const creatorById = new Map<number, number>();
  for (const question of questions) {
    creatorById.set(question.questionId, question.createdById);
  }

  for (const questionId of questionIds) {
    const creatorId = creatorById.get(questionId);
    if (creatorId === undefined) {
      throw httpError(400, `Unknown question id: ${questionId}`);
    }
    if (user.role !== "admin" && creatorId !== user.userId) {
      throw httpError(403, `You can only use your own questions (question ${questionId})`);
    }
  }
};

// Replaces a quiz's whole question list. The position in `questionIds` is the question's order.
export const replaceQuizQuestions = async (tx: Orm, quizId: number, questionIds: number[]) => {
  await tx.QuizQuestions.where({ quizId }).deleteAll();
  for (let index = 0; index < questionIds.length; index++) {
    await tx.QuizQuestions.create({ quizId, questionId: questionIds[index]!, orderIndex: index });
  }
};
