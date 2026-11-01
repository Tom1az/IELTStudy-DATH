import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../app.ts";
import { db } from "../prisma/db.ts";
import {
  authHeader,
  createTestCourse,
  createTestLesson,
  createTestQuestion,
  createTestQuiz,
  createTestSkill,
  createTestUser,
  enrollTestUser,
  resetDb,
} from "../test/db.ts";

// Starting an attempt returns the quiz, whose passages have a signed mediaUrl. Never call
// Supabase from tests.
vi.mock("../services/storage.ts", () => import("../test/fake-storage.ts"));

beforeEach(async () => {
  await resetDb();
});

// An approved course with a lesson quiz of three questions, and a learner enrolled in it.
// Answers: true/false/not given "true", multiple choice "B", matching { B: "ii", C: "i" }.
const setUp = async (status: "draft" | "approved" = "approved") => {
  const { user: instructor } = await createTestUser({ role: "instructor" });
  const course = await createTestCourse({ instructorId: instructor.userId, status });
  const lesson = await createTestLesson({ courseId: course.courseId });
  const skill = await createTestSkill();

  const tfng = await createTestQuestion({
    createdById: instructor.userId,
    skillIds: [skill.skillId],
  });
  const choice = await createTestQuestion({
    createdById: instructor.userId,
    skillIds: [skill.skillId],
    questionType: "multiple_choice",
    options: [
      { id: "A", text: "studied" },
      { id: "B", text: "had studied" },
    ],
    answerKey: "B",
  });
  const matching = await createTestQuestion({
    createdById: instructor.userId,
    skillIds: [skill.skillId],
    questionType: "matching",
    options: {
      items: [
        { id: "B", text: "Paragraph B" },
        { id: "C", text: "Paragraph C" },
      ],
      choices: [
        { id: "i", text: "A compromise" },
        { id: "ii", text: "The case in favour" },
      ],
    },
    answerKey: { B: "ii", C: "i" },
  });

  const quiz = await createTestQuiz({
    createdById: instructor.userId,
    lessonId: lesson.lessonId,
    questionIds: [tfng.questionId, choice.questionId, matching.questionId],
  });
  const { user: learner } = await createTestUser();
  await enrollTestUser(learner.userId, course.courseId);

  return { instructor, course, quiz, learner, skill, tfng, choice, matching };
};

const start = (quizId: number, userId: number) =>
  request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", authHeader(userId));

const submit = (attemptId: number, userId: number, responses: object[]) =>
  request(app)
    .post(`/api/v1/attempts/${attemptId}/submit`)
    .set("Authorization", authHeader(userId))
    .send({ responses });

// Starts an attempt and returns its id
const startAttempt = async (quizId: number, userId: number) => {
  const res = await start(quizId, userId);
  expect([200, 201]).toContain(res.status);
  return res.body.attempt.attemptId as number;
};

describe("POST /api/v1/quizzes/:quizId/attempts", () => {
  it("starts an attempt with the questions but no answers, then resumes it", async () => {
    const { quiz, learner } = await setUp();

    const first = await start(quiz.quizId, learner.userId);
    expect(first.status).toBe(201);
    expect(first.body.attempt).toMatchObject({
      quizId: quiz.quizId,
      status: "in_progress",
      completedAt: null,
      totalScore: null,
      maxScore: 3,
    });
    expect(first.body.quiz.questions).toHaveLength(3);
    for (const question of first.body.quiz.questions) {
      expect(question).not.toHaveProperty("answerKey");
      expect(question).not.toHaveProperty("explanation");
      expect(question).not.toHaveProperty("skills");
    }

    const second = await start(quiz.quizId, learner.userId);
    expect(second.status).toBe(200);
    expect(second.body.attempt.attemptId).toBe(first.body.attempt.attemptId);
  });

  it("starts a new attempt after the last one was submitted", async () => {
    const { quiz, learner } = await setUp();
    const attemptId = await startAttempt(quiz.quizId, learner.userId);
    await submit(attemptId, learner.userId, []);

    const res = await start(quiz.quizId, learner.userId);

    expect(res.status).toBe(201);
    expect(res.body.attempt.attemptId).not.toBe(attemptId);
  });

  it("gives two starts at the same moment the same attempt", async () => {
    const { quiz, learner } = await setUp();

    const results = await Promise.all([
      start(quiz.quizId, learner.userId),
      start(quiz.quizId, learner.userId),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 201]);
    expect(results[0]!.body.attempt.attemptId).toBe(results[1]!.body.attempt.attemptId);
    const rows = await db.orm.public.QuizAttempts.where({ quizId: quiz.quizId }).all();
    expect(rows).toHaveLength(1);
  });

  it("refuses learners who aren't enrolled (403) and instructors (403)", async () => {
    const { quiz, instructor } = await setUp();
    const { user: stranger } = await createTestUser();

    expect((await start(quiz.quizId, stranger.userId)).status).toBe(403);
    expect((await start(quiz.quizId, instructor.userId)).status).toBe(403);
  });

  it("hides quizzes of courses that aren't approved (404)", async () => {
    const { quiz, learner } = await setUp("draft");

    expect((await start(quiz.quizId, learner.userId)).status).toBe(404);
    expect((await start(9999, learner.userId)).status).toBe(404);
  });

  it("refuses a second diagnostic once the first is completed (409)", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const question = await createTestQuestion({ createdById: admin.userId });
    const diagnostic = await createTestQuiz({
      createdById: admin.userId,
      kind: "diagnostic",
      questionIds: [question.questionId],
    });
    const { user: learner } = await createTestUser();

    // Any learner may take the diagnostic: it belongs to no course
    const attemptId = await startAttempt(diagnostic.quizId, learner.userId);
    expect((await submit(attemptId, learner.userId, [])).status).toBe(200);

    expect((await start(diagnostic.quizId, learner.userId)).status).toBe(409);
  });

  it("refuses a quiz with no questions (409)", async () => {
    const { quiz, learner } = await setUp();
    await db.orm.public.QuizQuestions.where({ quizId: quiz.quizId }).deleteAll();

    expect((await start(quiz.quizId, learner.userId)).status).toBe(409);
  });
});

describe("POST /api/v1/attempts/:attemptId/submit", () => {
  it("grades every answer on the server and logs the responses", async () => {
    const { quiz, learner, tfng, choice, matching } = await setUp();
    const attemptId = await startAttempt(quiz.quizId, learner.userId);

    const res = await submit(attemptId, learner.userId, [
      { questionId: matching.questionId, answer: { B: "ii", C: "i" }, responseTimeSeconds: 30 },
      { questionId: tfng.questionId, answer: "true", responseTimeSeconds: 4.5 },
      { questionId: choice.questionId, answer: "B" },
    ]);

    expect(res.status).toBe(200);
    const result = res.body.result;
    expect(result.attempt).toMatchObject({ status: "completed", totalScore: 3, maxScore: 3 });
    expect(result.scorePercent).toBe(100);
    expect(result.masteryChanges).toEqual([]);
    expect(result.recommendations).toEqual([]);

    // Responses come in quiz order; attemptOrder is the order they were sent in
    expect(result.responses.map((r: { questionId: number }) => r.questionId)).toEqual([
      tfng.questionId,
      choice.questionId,
      matching.questionId,
    ]);
    expect(result.responses[0]).toMatchObject({
      userAnswer: "true",
      isCorrect: true,
      correctAnswer: "true",
      explanation: "The notice says 9 am.",
      attemptOrder: 2,
      responseTimeSeconds: 4.5,
    });
    expect(result.responses[0].skills).toHaveLength(1);
    expect(result.responses[1]).toMatchObject({ attemptOrder: 3, responseTimeSeconds: null });
    expect(result.responses[2]).toMatchObject({ attemptOrder: 1 });

    const rows = await db.orm.public.QuestionResponses.where({ attemptId }).all();
    expect(rows).toHaveLength(3);
  });

  it("counts wrong and skipped answers as wrong", async () => {
    const { quiz, learner, tfng, choice, matching } = await setUp();
    const attemptId = await startAttempt(quiz.quizId, learner.userId);

    const res = await submit(attemptId, learner.userId, [
      { questionId: choice.questionId, answer: "A" },
      // one item wrong: matching is all or nothing
      { questionId: matching.questionId, answer: { B: "ii", C: "ii" } },
    ]);

    expect(res.status).toBe(200);
    const result = res.body.result;
    expect(result.attempt.totalScore).toBe(0);
    expect(result.scorePercent).toBe(0);
    // The skipped question is listed, but has no response row
    expect(result.responses[0]).toMatchObject({
      questionId: tfng.questionId,
      userAnswer: null,
      isCorrect: false,
      attemptOrder: null,
      responseTimeSeconds: null,
      correctAnswer: "true",
    });
    const rows = await db.orm.public.QuestionResponses.where({ attemptId }).all();
    expect(rows).toHaveLength(2);
  });

  it("rounds the score to one decimal", async () => {
    const { quiz, learner, tfng } = await setUp();
    const attemptId = await startAttempt(quiz.quizId, learner.userId);

    const res = await submit(attemptId, learner.userId, [
      { questionId: tfng.questionId, answer: "true" },
    ]);

    expect(res.body.result.scorePercent).toBe(33.3);
  });

  it("rejects questions outside the quiz, duplicates and wrong answer shapes (400)", async () => {
    const { quiz, learner, instructor, tfng, choice } = await setUp();
    const other = await createTestQuestion({ createdById: instructor.userId });
    const attemptId = await startAttempt(quiz.quizId, learner.userId);

    const outside = await submit(attemptId, learner.userId, [
      { questionId: other.questionId, answer: "true" },
    ]);
    expect(outside.status).toBe(400);

    const twice = await submit(attemptId, learner.userId, [
      { questionId: tfng.questionId, answer: "true" },
      { questionId: tfng.questionId, answer: "false" },
    ]);
    expect(twice.status).toBe(400);

    const wrongShape = await submit(attemptId, learner.userId, [
      { questionId: choice.questionId, answer: { A: "B" } },
    ]);
    expect(wrongShape.status).toBe(400);

    const isCorrectSent = await submit(attemptId, learner.userId, [
      { questionId: tfng.questionId, answer: "false", isCorrect: true },
    ]);
    expect(isCorrectSent.status).toBe(400);

    // None of these closed the attempt
    const row = await db.orm.public.QuizAttempts.first({ attemptId });
    expect(row?.completedAt).toBeNull();
  });

  it("only lets the learner who started it submit (403, 404)", async () => {
    const { quiz, learner, course } = await setUp();
    const { user: other } = await createTestUser();
    await enrollTestUser(other.userId, course.courseId);
    const attemptId = await startAttempt(quiz.quizId, learner.userId);

    expect((await submit(attemptId, other.userId, [])).status).toBe(403);
    expect((await submit(9999, learner.userId, [])).status).toBe(404);
  });

  it("refuses a second submit (409)", async () => {
    const { quiz, learner } = await setUp();
    const attemptId = await startAttempt(quiz.quizId, learner.userId);

    expect((await submit(attemptId, learner.userId, [])).status).toBe(200);
    expect((await submit(attemptId, learner.userId, [])).status).toBe(409);
  });

  it("writes the responses once when two submits race", async () => {
    const { quiz, learner, tfng } = await setUp();
    const attemptId = await startAttempt(quiz.quizId, learner.userId);
    const responses = [{ questionId: tfng.questionId, answer: "true" }];

    const results = await Promise.all([
      submit(attemptId, learner.userId, responses),
      submit(attemptId, learner.userId, responses),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    const rows = await db.orm.public.QuestionResponses.where({ attemptId }).all();
    expect(rows).toHaveLength(1);
  });

  it("locks an answered diagnostic question against edits (409)", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const question = await createTestQuestion({ createdById: admin.userId });
    const diagnostic = await createTestQuiz({
      createdById: admin.userId,
      kind: "diagnostic",
      questionIds: [question.questionId],
    });
    const { user: learner } = await createTestUser();
    const attemptId = await startAttempt(diagnostic.quizId, learner.userId);
    await submit(attemptId, learner.userId, [{ questionId: question.questionId, answer: "true" }]);

    const res = await request(app)
      .patch(`/api/v1/questions/${question.questionId}`)
      .set("Authorization", authHeader(admin.userId))
      .send({ questionText: "Edited after it was answered" });

    expect(res.status).toBe(409);
  });
});

describe("GET /api/v1/attempts/:attemptId", () => {
  it("reveals nothing before the attempt is submitted", async () => {
    const { quiz, learner } = await setUp();
    const attemptId = await startAttempt(quiz.quizId, learner.userId);

    const res = await request(app)
      .get(`/api/v1/attempts/${attemptId}`)
      .set("Authorization", authHeader(learner.userId));

    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({
      attempt: { attemptId, status: "in_progress" },
      quiz: { quizId: quiz.quizId, questionCount: 3 },
      scorePercent: null,
      responses: [],
    });
  });

  it("returns the same graded result as the submit, to the learner and to admins", async () => {
    const { quiz, learner, tfng } = await setUp();
    const attemptId = await startAttempt(quiz.quizId, learner.userId);
    const submitted = await submit(attemptId, learner.userId, [
      { questionId: tfng.questionId, answer: "true" },
    ]);
    const { user: admin } = await createTestUser({ role: "admin" });

    const mine = await request(app)
      .get(`/api/v1/attempts/${attemptId}`)
      .set("Authorization", authHeader(learner.userId));
    const asAdmin = await request(app)
      .get(`/api/v1/attempts/${attemptId}`)
      .set("Authorization", authHeader(admin.userId));

    expect(mine.status).toBe(200);
    expect(mine.body.result).toEqual(submitted.body.result);
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.result).toEqual(submitted.body.result);
  });

  it("refuses other learners and instructors (403)", async () => {
    const { quiz, learner, instructor } = await setUp();
    const { user: other } = await createTestUser();
    const attemptId = await startAttempt(quiz.quizId, learner.userId);

    for (const user of [other, instructor]) {
      const res = await request(app)
        .get(`/api/v1/attempts/${attemptId}`)
        .set("Authorization", authHeader(user.userId));
      expect(res.status).toBe(403);
    }
  });
});

describe("GET /api/v1/me/attempts", () => {
  it("lists only my attempts, newest first, optionally for one quiz", async () => {
    const { quiz, learner, instructor } = await setUp();
    const question = await createTestQuestion({ createdById: instructor.userId });
    const diagnostic = await createTestQuiz({
      createdById: instructor.userId,
      kind: "diagnostic",
      questionIds: [question.questionId],
    });
    const first = await startAttempt(quiz.quizId, learner.userId);
    await submit(first, learner.userId, []);
    const second = await startAttempt(diagnostic.quizId, learner.userId);
    // Someone else's attempt never shows up
    const { user: other } = await createTestUser();
    await startAttempt(diagnostic.quizId, other.userId);

    const all = await request(app)
      .get("/api/v1/me/attempts")
      .set("Authorization", authHeader(learner.userId));
    expect(all.status).toBe(200);
    expect(all.body.attempts.map((a: { attemptId: number }) => a.attemptId)).toEqual([
      second,
      first,
    ]);
    expect(all.body.attempts[1]).toMatchObject({
      status: "completed",
      totalScore: 0,
      quiz: { quizId: quiz.quizId, kind: "lesson", questionCount: 3 },
    });

    const filtered = await request(app)
      .get(`/api/v1/me/attempts?quizId=${quiz.quizId}`)
      .set("Authorization", authHeader(learner.userId));
    expect(filtered.body.attempts.map((a: { attemptId: number }) => a.attemptId)).toEqual([first]);

    const none = await request(app)
      .get("/api/v1/me/attempts?quizId=9999")
      .set("Authorization", authHeader(learner.userId));
    expect(none.status).toBe(200);
    expect(none.body.attempts).toEqual([]);
  });

  it("is for learners only (403)", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });

    const res = await request(app)
      .get("/api/v1/me/attempts")
      .set("Authorization", authHeader(instructor.userId));

    expect(res.status).toBe(403);
  });
});

// Time limit rule (services/attempts.ts, closeAttemptIfTimeIsUp): a late submit is rejected,
// and a late or unsubmitted attempt is closed with score 0.
describe("quiz time limit", () => {
  // Gives the quiz a time limit and moves the attempt's start back in time. started_at can't be
  // set through the ORM (the database fills it in), so it is moved back in SQL.
  const setLimit = async (quizId: number, seconds: number) => {
    await db.orm.public.Quizzes.where({ quizId }).update({ timeLimitSeconds: seconds });
  };
  const startedAgo = async (attemptId: number, seconds: number) => {
    await db.runtime().execute(
      db.raw.sql`
        UPDATE quiz_attempts
        SET started_at = started_at - make_interval(secs => ${seconds})
        WHERE attempt_id = ${attemptId}
      `
        .affectedCount()
        .build(),
    );
  };
  const getResult = (attemptId: number, userId: number) =>
    request(app).get(`/api/v1/attempts/${attemptId}`).set("Authorization", authHeader(userId));

  it("rejects a submit after the deadline and the grace period, and closes the attempt", async () => {
    const { quiz, learner, tfng } = await setUp();
    await setLimit(quiz.quizId, 60);
    const attemptId = await startAttempt(quiz.quizId, learner.userId);
    await startedAgo(attemptId, 600);

    const res = await submit(attemptId, learner.userId, [
      { questionId: tfng.questionId, answer: "true" },
    ]);

    expect(res.status).toBe(409);
    const closed = await getResult(attemptId, learner.userId);
    expect(closed.body.result.attempt.totalScore).toBe(0);
    const rows = await db.orm.public.QuestionResponses.where({ attemptId }).all();
    expect(rows).toHaveLength(0);
  });

  it("still grades a submit inside the grace period", async () => {
    const { quiz, learner, tfng } = await setUp();
    await setLimit(quiz.quizId, 60);
    const attemptId = await startAttempt(quiz.quizId, learner.userId);
    await startedAgo(attemptId, 70);

    const res = await submit(attemptId, learner.userId, [
      { questionId: tfng.questionId, answer: "true" },
    ]);

    expect(res.status).toBe(200);
    expect(res.body.result.attempt.totalScore).toBe(1);
  });

  it("closes an unsubmitted attempt that ran out of time when it is opened again", async () => {
    const { quiz, learner } = await setUp();
    await setLimit(quiz.quizId, 60);
    const oldId = await startAttempt(quiz.quizId, learner.userId);
    await startedAgo(oldId, 600);

    const again = await start(quiz.quizId, learner.userId);

    // A fresh attempt, not the expired one
    expect(again.status).toBe(201);
    expect(again.body.attempt.attemptId).not.toBe(oldId);
    const old = await getResult(oldId, learner.userId);
    expect(old.body.result.attempt.completedAt).not.toBeNull();
    expect(old.body.result.attempt.totalScore).toBe(0);
    const rows = await db.orm.public.QuestionResponses.where({ attemptId: oldId }).all();
    expect(rows).toHaveLength(0);
    // The closed attempt can't be submitted afterwards
    const lateSubmit = await submit(oldId, learner.userId, []);
    expect(lateSubmit.status).toBe(409);
  });

  it("closes an expired attempt when it is read", async () => {
    const { quiz, learner } = await setUp();
    await setLimit(quiz.quizId, 60);
    const attemptId = await startAttempt(quiz.quizId, learner.userId);
    await startedAgo(attemptId, 600);

    const res = await getResult(attemptId, learner.userId);

    expect(res.status).toBe(200);
    expect(res.body.result.attempt.completedAt).not.toBeNull();
    expect(res.body.result.attempt.totalScore).toBe(0);
  });

  it("leaves an attempt alone while there is time, and during the grace period", async () => {
    const { quiz, learner } = await setUp();
    await setLimit(quiz.quizId, 60);
    const attemptId = await startAttempt(quiz.quizId, learner.userId);

    // 10 seconds in, and 70 seconds in (10 seconds over, inside the 30-second grace)
    for (const secondsAgo of [10, 60]) {
      await startedAgo(attemptId, secondsAgo);
      const res = await start(quiz.quizId, learner.userId);
      expect(res.status).toBe(200);
      expect(res.body.attempt.attemptId).toBe(attemptId);
      expect(res.body.attempt.completedAt).toBeNull();
    }
  });

  it("never closes a quiz without a time limit", async () => {
    const { quiz, learner } = await setUp();
    const attemptId = await startAttempt(quiz.quizId, learner.userId);
    await startedAgo(attemptId, 86400);

    const res = await start(quiz.quizId, learner.userId);

    expect(res.status).toBe(200);
    expect(res.body.attempt.attemptId).toBe(attemptId);
  });

  it("never auto-closes the diagnostic, so it can still be completed", async () => {
    const { instructor, tfng, learner } = await setUp();
    const diagnostic = await createTestQuiz({
      createdById: instructor.userId,
      kind: "diagnostic",
      questionIds: [tfng.questionId],
    });
    await setLimit(diagnostic.quizId, 60);
    const attemptId = await startAttempt(diagnostic.quizId, learner.userId);
    await startedAgo(attemptId, 600);

    const res = await start(diagnostic.quizId, learner.userId);

    expect(res.status).toBe(200);
    expect(res.body.attempt.attemptId).toBe(attemptId);
    expect(res.body.attempt.completedAt).toBeNull();
  });
});
