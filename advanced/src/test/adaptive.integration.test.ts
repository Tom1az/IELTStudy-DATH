import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import "temporal-polyfill/global";
import { db } from "../prisma/db.ts";
import { createStandaloneAdvancedApp } from "../routes/index.ts";

const orm = db.orm.public;
const app = createStandaloneAdvancedApp();
const hasDb = Boolean(process.env.TEST_DATABASE_URL);

// Varchar columns have a branded type; the backend's helper for it is not in this package
const text = (value: string) => value as never;

const reset = () =>
  db.runtime().execute(
    db.raw.sql`
      TRUNCATE TABLE
        users, courses, lessons, lesson_skills, passages_media, skills,
        questions, question_skills, quizzes, quiz_questions, quiz_attempts, question_responses,
        user_skill_mastery, enrollments, lesson_progress, recommendations
      RESTART IDENTITY CASCADE
    `
      .affectedCount()
      .build(),
  );

const createUser = async (email: string, role: "learner" | "instructor" = "learner") => {
  const user = await orm.Users.create({
    email: text(email),
    fullName: text(email),
    hashedPass: text("x"),
    role,
    targetBand: null,
    isActive: true,
  });
  return user.userId;
};

const createSkill = async (code: string) => {
  const skill = await orm.Skills.create({
    skillCode: text(code),
    name: text(code),
    category: "reading",
    description: null,
  });
  return skill.skillId;
};

const createCourse = async (instructorId: number, status: "approved" | "draft" = "approved") => {
  const course = await orm.Courses.create({
    instructorId,
    title: text("Course"),
    description: null,
    targetLevel: "beginner",
    status,
    reviewFeedback: null,
    reviewedById: null,
    submittedAt: null,
    reviewedAt: null,
  });
  return course.courseId;
};

const createLesson = async (
  courseId: number,
  skillId: number,
  kind: "core" | "remedial",
  orderIndex: number,
) => {
  const lesson = await orm.Lessons.create({
    courseId,
    title: text(`Lesson ${orderIndex}`),
    content: null,
    kind,
    orderIndex,
  });
  await orm.LessonSkills.create({ lessonId: lesson.lessonId, skillId, weight: 1 });
  return lesson.lessonId;
};

const setMastery = (userId: number, skillId: number, masteryProb: number) =>
  orm.UserSkillMastery.create({ userId, skillId, masteryProb, observations: 1 });

// A one-question quiz on `skillId`, and a submitted attempt that answered it correctly
const createAttempt = async (userId: number, createdById: number, skillId: number) => {
  const question = await orm.Questions.create({
    passageId: null,
    createdById,
    questionType: "gap_fill",
    questionText: "Q",
    options: null,
    answerKey: ["a"],
    explanation: null,
    difficulty: 1,
  });
  const { questionId } = question;
  await orm.QuestionSkills.create({ questionId, skillId, weight: 1 });
  const quiz = await orm.Quizzes.create({
    kind: "practice",
    lessonId: null,
    createdById,
    title: text("Quiz"),
    description: null,
    timeLimitSeconds: null,
  });
  await orm.QuizQuestions.create({ quizId: quiz.quizId, questionId, orderIndex: 0 });
  const attempt = await orm.QuizAttempts.create({
    userId,
    quizId: quiz.quizId,
    completedAt: null,
    totalScore: null,
    maxScore: 1,
    masteryChanges: null,
  });
  const { attemptId } = attempt;
  await orm.QuestionResponses.create({
    attemptId,
    questionId,
    userAnswer: "a",
    isCorrect: true,
    attemptOrder: 1,
    responseTimeSeconds: null,
  });
  await orm.QuizAttempts.where({ attemptId }).update({
    completedAt: Temporal.Now.instant(),
    totalScore: 1,
  });
  return attemptId;
};

const token = (userId: number) =>
  `Bearer ${jwt.sign({}, "test-jwt-secret", { subject: String(userId), algorithm: "HS256" })}`;

const process_ = (attemptId: number, userId: number) =>
  request(app)
    .post(`/api/v1/mastery/attempts/${attemptId}/process`)
    .set("Authorization", token(userId));

describe.skipIf(!hasDb)("adaptive flow on PostgreSQL", () => {
  beforeEach(async () => {
    await reset();
  });

  afterAll(async () => {
    await db.close();
  });

  it("applies an attempt once when it is processed many times at once", async () => {
    const instructor = await createUser("i@t.dev", "instructor");
    const learner = await createUser("l@t.dev");
    const skill = await createSkill("R_A");
    const course = await createCourse(instructor);
    await createLesson(course, skill, "remedial", 0);
    await setMastery(learner, skill, 0.05);
    const attemptId = await createAttempt(learner, instructor, skill);

    const results = await Promise.all(
      Array.from({ length: 6 }, () => process_(attemptId, learner)),
    );

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    const mastery = await orm.UserSkillMastery.where({ userId: learner }).all();
    expect(mastery).toHaveLength(1);
    expect(mastery[0]!.observations).toBe(2);
    const saved = await orm.Recommendations.where({ userId: learner }).all();
    expect(saved).toHaveLength(1);
  });

  it("doesn't touch mastery for a closed attempt without answers", async () => {
    const instructor = await createUser("i@t.dev", "instructor");
    const learner = await createUser("l@t.dev");
    const skill = await createSkill("R_A");
    const attemptId = await createAttempt(learner, instructor, skill);
    await orm.QuestionResponses.where({ attemptId }).deleteAll();

    const res = await process_(attemptId, learner);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ masteryChanges: [], recommendations: [] });
    expect(await orm.UserSkillMastery.where({ userId: learner }).all()).toHaveLength(0);
  });

  it("never recommends a locked lesson, and says when the learner isn't enrolled", async () => {
    const instructor = await createUser("i@t.dev", "instructor");
    const learner = await createUser("l@t.dev");
    const prerequisite = await createSkill("R_STRONG");
    const weak = await createSkill("R_WEAK");
    const course = await createCourse(instructor);
    await createLesson(course, prerequisite, "core", 0);
    const locked = await createLesson(course, weak, "core", 1);
    const open = await createLesson(course, weak, "remedial", 2);
    await setMastery(learner, weak, 0.1);

    const res = await request(app)
      .get("/api/v1/recommendations")
      .set("Authorization", token(learner));

    const ids = res.body.recommendations.map(
      (r: { lesson: { lessonId: number } }) => r.lesson.lessonId,
    );
    expect(ids).toEqual([open]);
    expect(ids).not.toContain(locked);
    expect(res.body.recommendations[0].lesson.isEnrolled).toBe(false);
  });

  it("drops recommendations once their skill is mastered", async () => {
    const instructor = await createUser("i@t.dev", "instructor");
    const learner = await createUser("l@t.dev");
    const skill = await createSkill("R_A");
    const course = await createCourse(instructor);
    await createLesson(course, skill, "remedial", 0);
    await setMastery(learner, skill, 0.1);
    const get = () =>
      request(app).get("/api/v1/recommendations").set("Authorization", token(learner));

    expect((await get()).body.recommendations).toHaveLength(1);
    await orm.UserSkillMastery.where({ userId: learner, skillId: skill }).update({
      masteryProb: 0.9,
    });

    expect((await get()).body.recommendations).toEqual([]);
  });

  it("doesn't fill a short batch with rows from an older one", async () => {
    const instructor = await createUser("i@t.dev", "instructor");
    const learner = await createUser("l@t.dev");
    const [a, b, c] = [await createSkill("R_A"), await createSkill("R_B"), await createSkill("R_C")];
    const course = await createCourse(instructor);
    for (const [index, skill] of [a, b, c].entries()) {
      await createLesson(course, skill, "remedial", index);
      await setMastery(learner, skill, 0.1);
    }
    const get = () =>
      request(app).get("/api/v1/recommendations").set("Authorization", token(learner));
    expect((await get()).body.recommendations).toHaveLength(3);

    // A newer attempt, after which only two skills are weak
    await orm.UserSkillMastery.where({ userId: learner, skillId: c }).update({ masteryProb: 0.9 });
    const attemptId = await createAttempt(learner, instructor, a);
    await process_(attemptId, learner);

    const skills = (await get()).body.recommendations.map(
      (r: { skill: { skillId: number } }) => r.skill.skillId,
    );
    expect(skills.sort()).toEqual([a, b].sort());
  });

  it("answers 404 for the gates of a course the learner can't see", async () => {
    const instructor = await createUser("i@t.dev", "instructor");
    const learner = await createUser("l@t.dev");
    const skill = await createSkill("R_A");
    const draft = await createCourse(instructor, "draft");
    await createLesson(draft, skill, "core", 0);

    const res = await request(app)
      .get(`/api/v1/courses/${draft}/gates`)
      .set("Authorization", token(learner));

    expect(res.status).toBe(404);
  });
});
