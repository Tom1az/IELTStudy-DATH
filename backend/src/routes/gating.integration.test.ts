import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import app from "../app.ts";
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

// A stand-in for the Advanced service's GET /courses/{courseId}/gates, with one locked lesson
const stubGates = (lockedLessonId: number) => {
  vi.stubEnv("ADVANCED_SERVICE_URL", "http://advanced.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        gates: [{ lessonId: lockedLessonId, locked: true, reason: "Finish the lesson before it" }],
      }),
    ),
  );
};

const setUp = async () => {
  const { user: instructor } = await createTestUser({ role: "instructor" });
  const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
  const lesson = await createTestLesson({ courseId: course.courseId });
  const skill = await createTestSkill();
  const question = await createTestQuestion({
    createdById: instructor.userId,
    skillIds: [skill.skillId],
  });
  const quiz = await createTestQuiz({
    createdById: instructor.userId,
    lessonId: lesson.lessonId,
    questionIds: [question.questionId],
  });
  const { user: learner } = await createTestUser();
  await enrollTestUser(learner.userId, course.courseId);
  return { instructor, lesson, quiz, learner };
};

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("locked lessons", () => {
  it("can't be completed, which would unlock the next lesson", async () => {
    const { lesson, learner } = await setUp();
    stubGates(lesson.lessonId);

    const res = await request(app)
      .put(`/api/v1/lessons/${lesson.lessonId}/progress`)
      .set("Authorization", authHeader(learner.userId))
      .send({ status: "completed" });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("Finish the lesson before it");
  });

  it("can't have their quiz opened or started", async () => {
    const { lesson, quiz, learner } = await setUp();
    stubGates(lesson.lessonId);
    const asLearner = authHeader(learner.userId);

    const opened = await request(app)
      .get(`/api/v1/quizzes/${quiz.quizId}`)
      .set("Authorization", asLearner);
    const started = await request(app)
      .post(`/api/v1/quizzes/${quiz.quizId}/attempts`)
      .set("Authorization", asLearner);

    expect(opened.status).toBe(403);
    expect(started.status).toBe(403);
  });

  it("stay open to staff, and to everyone when Advanced is down", async () => {
    const { instructor, lesson, quiz, learner } = await setUp();
    stubGates(lesson.lessonId);

    const asOwner = await request(app)
      .get(`/api/v1/quizzes/${quiz.quizId}`)
      .set("Authorization", authHeader(instructor.userId));
    expect(asOwner.status).toBe(200);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );
    const res = await request(app)
      .put(`/api/v1/lessons/${lesson.lessonId}/progress`)
      .set("Authorization", authHeader(learner.userId))
      .send({ status: "completed" });
    expect(res.status).toBe(200);
  });
});

describe("recovering a missed mastery update", () => {
  it("processes an attempt with nothing stored when it is read, then only reads", async () => {
    const { quiz, learner } = await setUp();
    const asLearner = authHeader(learner.userId);
    const started = await request(app)
      .post(`/api/v1/quizzes/${quiz.quizId}/attempts`)
      .set("Authorization", asLearner);
    const attemptId = started.body.attempt.attemptId;
    // Advanced is not configured yet: the submit is saved without an outcome
    await request(app)
      .post(`/api/v1/attempts/${attemptId}/submit`)
      .set("Authorization", asLearner)
      .send({ responses: [] });

    const fetchMock = vi.fn(async () => Response.json({ masteryChanges: [], recommendations: [] }));
    vi.stubEnv("ADVANCED_SERVICE_URL", "http://advanced.test");
    vi.stubGlobal("fetch", fetchMock);
    await request(app).get(`/api/v1/attempts/${attemptId}`).set("Authorization", asLearner);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://advanced.test/api/v1/mastery/attempts/${attemptId}/process`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});
