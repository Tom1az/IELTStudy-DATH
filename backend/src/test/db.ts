// Helpers for tests that use the test database (TEST_DATABASE_URL, see vitest.config.ts).
import bcrypt from "bcrypt";
import { db } from "../prisma/db.ts";
import { varchar } from "../utils/db-types.ts";
import { signToken } from "../utils/jwt.ts";
import type { CourseLevel, CourseStatus } from "../services/courses.ts";
import type { Json, QuestionType } from "../services/questions.ts";
import type { UserRole } from "../utils/public-user.ts";

type SkillCategory = "listening" | "reading" | "writing" | "speaking";

// Empties every table and restarts the id counters, so each test starts from a blank
// database. When a table is added to schema.prisma, add it here too.
export const resetDb = async () => {
  const plan = db.raw.sql`
    TRUNCATE TABLE
      users, courses, lessons, lesson_skills, passages_media, skills,
      questions, question_skills, quizzes, quiz_questions, quiz_attempts, question_responses,
      user_skill_mastery, enrollments, lesson_progress, recommendations
    RESTART IDENTITY CASCADE
  `
    .affectedCount()
    .build();

  await db.runtime().execute(plan);
};

let userCount = 0;

// Inserts a user straight into the database and returns the row plus its plain password.
// bcrypt cost 4 (the minimum) keeps tests fast; the app itself uses 10.
export const createTestUser = async (
  options: { role?: UserRole; isActive?: boolean; email?: string } = {},
) => {
  userCount += 1;
  const email = options.email ?? `user${userCount}@test.dev`;
  const password = "test-password";

  const user = await db.orm.public.Users.create({
    email: varchar<255>(email),
    fullName: varchar<255>(`Test User ${userCount}`),
    hashedPass: varchar<255>(await bcrypt.hash(password, 4)),
    role: options.role ?? "learner",
    isActive: options.isActive ?? true,
  });

  return { user, password };
};

// The `Authorization` header value for a user, as the frontend would send it
export const authHeader = (userId: number) => `Bearer ${signToken(userId)}`;

let skillCount = 0;

// Inserts a skill with a unique code (e.g. TEST_SKILL_1)
export const createTestSkill = async (options: { category?: SkillCategory } = {}) => {
  skillCount += 1;
  return db.orm.public.Skills.create({
    skillCode: varchar<64>(`TEST_SKILL_${skillCount}`),
    name: varchar<255>(`Test skill ${skillCount}`),
    category: options.category ?? "reading",
    description: null,
  });
};

// Inserts a course straight into the database, in any status. A rejected course gets
// feedback, because the database requires it.
export const createTestCourse = async (options: {
  instructorId: number;
  status?: CourseStatus;
  targetLevel?: CourseLevel;
}) => {
  const status = options.status ?? "draft";
  return db.orm.public.Courses.create({
    instructorId: options.instructorId,
    title: varchar<255>("Test course"),
    description: null,
    targetLevel: options.targetLevel ?? "intermediate",
    status,
    reviewFeedback: status === "rejected" ? "Needs work" : null,
  });
};

// Inserts a lesson, tagged with the given skills (weight 1 each)
export const createTestLesson = async (options: {
  courseId: number;
  kind?: "core" | "remedial";
  orderIndex?: number;
  skillIds?: number[];
}) => {
  const lesson = await db.orm.public.Lessons.create({
    courseId: options.courseId,
    title: varchar<255>("Test lesson"),
    content: "Lesson body",
    kind: options.kind ?? "core",
    orderIndex: options.orderIndex ?? 0,
  });
  for (const skillId of options.skillIds ?? []) {
    await db.orm.public.LessonSkills.create({ lessonId: lesson.lessonId, skillId, weight: 1 });
  }
  return lesson;
};

export const enrollTestUser = async (userId: number, courseId: number) => {
  return db.orm.public.Enrollments.create({ userId, courseId });
};

// Gives a lesson a quiz with one question that a learner has already answered, as if they had
// submitted an attempt. Used to check that learner history blocks deletes.
// With `passageId`, the question belongs to that passage.
export const createAnsweredQuiz = async (options: {
  lessonId: number;
  createdById: number;
  learnerId: number;
  passageId?: number;
}) => {
  const orm = db.orm.public;
  const quiz = await orm.Quizzes.create({
    kind: "lesson",
    lessonId: options.lessonId,
    createdById: options.createdById,
    title: varchar<255>("Test quiz"),
    description: null,
    timeLimitSeconds: null,
  });
  const question = await orm.Questions.create({
    passageId: options.passageId ?? null,
    createdById: options.createdById,
    questionType: "true_false_not_given",
    questionText: "The sky is green.",
    options: null,
    answerKey: "false",
    explanation: null,
    difficulty: 3,
  });
  await orm.QuizQuestions.create({
    quizId: quiz.quizId,
    questionId: question.questionId,
    orderIndex: 0,
  });
  // Started first and completed afterwards, so completed_at is never before started_at
  const attempt = await orm.QuizAttempts.create({
    userId: options.learnerId,
    quizId: quiz.quizId,
    completedAt: null,
    totalScore: null,
    maxScore: 1,
    masteryChanges: null,
  });
  await orm.QuizAttempts.where({ attemptId: attempt.attemptId }).update({
    completedAt: Temporal.Now.instant(),
    totalScore: 1,
  });
  await orm.QuestionResponses.create({
    attemptId: attempt.attemptId,
    questionId: question.questionId,
    userAnswer: "false",
    isCorrect: true,
    attemptOrder: 1,
    responseTimeSeconds: 5,
  });
  return { quiz, question, attempt };
};

// Inserts a question tagged with the given skills. Their weights are split evenly, so they add
// up to 1 as the Q-matrix requires. By default it is a true/false/not given question whose
// answer is "true"; pass `questionType`, `options` and `answerKey` together for another type.
export const createTestQuestion = async (options: {
  createdById: number;
  passageId?: number;
  skillIds?: number[];
  questionType?: QuestionType;
  options?: Json;
  answerKey?: Json;
}) => {
  const question = await db.orm.public.Questions.create({
    passageId: options.passageId ?? null,
    createdById: options.createdById,
    questionType: options.questionType ?? "true_false_not_given",
    questionText: "The library opens at nine.",
    options: options.options ?? null,
    answerKey: options.answerKey ?? "true",
    explanation: "The notice says 9 am.",
    difficulty: 3,
  });
  const skillIds = options.skillIds ?? [];
  for (const skillId of skillIds) {
    await db.orm.public.QuestionSkills.create({
      questionId: question.questionId,
      skillId,
      weight: 1 / skillIds.length,
    });
  }
  return question;
};

// Inserts a quiz with the given questions, in that order. A diagnostic has no lesson.
export const createTestQuiz = async (options: {
  createdById: number;
  questionIds: number[];
  kind?: "diagnostic" | "lesson" | "practice";
  lessonId?: number;
}) => {
  const quiz = await db.orm.public.Quizzes.create({
    kind: options.kind ?? "lesson",
    lessonId: options.lessonId ?? null,
    createdById: options.createdById,
    title: varchar<255>("Test quiz"),
    description: null,
    timeLimitSeconds: null,
  });
  for (let index = 0; index < options.questionIds.length; index++) {
    await db.orm.public.QuizQuestions.create({
      quizId: quiz.quizId,
      questionId: options.questionIds[index]!,
      orderIndex: index,
    });
  }
  return quiz;
};
