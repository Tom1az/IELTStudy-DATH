import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../app.ts";
import { db } from "../prisma/db.ts";
import { varchar } from "../utils/db-types.ts";
import {
  authHeader,
  createAnsweredQuiz,
  createTestCourse,
  createTestLesson,
  createTestQuestion,
  createTestQuiz,
  createTestUser,
  enrollTestUser,
  resetDb,
} from "../test/db.ts";

// Quiz views contain passages, whose mediaUrl is signed. Never call Supabase from tests.
vi.mock("../services/storage.ts", () => import("../test/fake-storage.ts"));

beforeEach(async () => {
  await resetDb();
});

// An instructor with a course (draft by default), a lesson and two questions of their own
const setUp = async (status: "draft" | "approved" = "draft") => {
  const { user: instructor } = await createTestUser({ role: "instructor" });
  const course = await createTestCourse({ instructorId: instructor.userId, status });
  const lesson = await createTestLesson({ courseId: course.courseId });
  const first = await createTestQuestion({ createdById: instructor.userId });
  const second = await createTestQuestion({ createdById: instructor.userId });
  return { instructor, course, lesson, questionIds: [first.questionId, second.questionId] };
};

describe("POST /api/v1/quizzes", () => {
  it("creates a lesson quiz with its questions in order, each passage listed once", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const course = await createTestCourse({ instructorId: instructor.userId });
    const lesson = await createTestLesson({ courseId: course.courseId });
    const passage = await db.orm.public.PassagesMedia.create({
      lessonId: lesson.lessonId,
      createdById: instructor.userId,
      type: "listening_audio",
      title: varchar<255>("Booking a class"),
      content: null,
      mediaPath: varchar<1024>(`${instructor.userId}/part1.mp3`),
      orderIndex: 0,
    });
    const a = await createTestQuestion({
      createdById: instructor.userId,
      passageId: passage.passageId,
    });
    const b = await createTestQuestion({
      createdById: instructor.userId,
      passageId: passage.passageId,
    });
    const c = await createTestQuestion({ createdById: instructor.userId });

    const res = await request(app)
      .post("/api/v1/quizzes")
      .set("Authorization", authHeader(instructor.userId))
      .send({
        kind: "lesson",
        lessonId: lesson.lessonId,
        title: "Listening check",
        questionIds: [c.questionId, a.questionId, b.questionId],
      });

    expect(res.status).toBe(201);
    expect(res.body.quiz).toMatchObject({
      kind: "lesson",
      lessonId: lesson.lessonId,
      title: "Listening check",
      questionCount: 3,
      timeLimitSeconds: null,
      createdById: instructor.userId,
    });
    expect(res.body.quiz.questions.map((q: { questionId: number }) => q.questionId)).toEqual([
      c.questionId,
      a.questionId,
      b.questionId,
    ]);
    expect(res.body.quiz.questions[0].answerKey).toBe("true");
    expect(res.body.quiz.passages).toHaveLength(1);
    expect(res.body.quiz.passages[0].mediaUrl).toContain("part1.mp3");
  });

  it("requires a lessonId for lesson and practice quizzes (400)", async () => {
    const { instructor, questionIds } = await setUp();

    for (const kind of ["lesson", "practice"]) {
      const res = await request(app)
        .post("/api/v1/quizzes")
        .set("Authorization", authHeader(instructor.userId))
        .send({ kind, title: "No lesson", questionIds });
      expect(res.status).toBe(400);
    }
  });

  it("creates a practice quiz in a lesson", async () => {
    const { instructor, lesson, questionIds } = await setUp();

    const res = await request(app)
      .post("/api/v1/quizzes")
      .set("Authorization", authHeader(instructor.userId))
      .send({ kind: "practice", lessonId: lesson.lessonId, title: "Practice set", questionIds });

    expect(res.status).toBe(201);
    expect(res.body.quiz.kind).toBe("practice");
  });

  it("checks the lesson: someone else's (403), invisible (404), approved course (409)", async () => {
    const { instructor, questionIds } = await setUp();
    const { user: other } = await createTestUser({ role: "instructor" });
    const otherApproved = await createTestCourse({
      instructorId: other.userId,
      status: "approved",
    });
    const otherApprovedLesson = await createTestLesson({ courseId: otherApproved.courseId });
    const otherDraft = await createTestCourse({ instructorId: other.userId });
    const otherDraftLesson = await createTestLesson({ courseId: otherDraft.courseId });
    const myApproved = await createTestCourse({
      instructorId: instructor.userId,
      status: "approved",
    });
    const myApprovedLesson = await createTestLesson({ courseId: myApproved.courseId });

    const send = (lessonId: number) =>
      request(app)
        .post("/api/v1/quizzes")
        .set("Authorization", authHeader(instructor.userId))
        .send({ kind: "lesson", lessonId, title: "Quiz", questionIds });

    expect((await send(otherApprovedLesson.lessonId)).status).toBe(403);
    expect((await send(otherDraftLesson.lessonId)).status).toBe(404);
    expect((await send(myApprovedLesson.lessonId)).status).toBe(409);
  });

  it("only uses questions I own (403) that exist (400)", async () => {
    const { instructor, lesson, questionIds } = await setUp();
    const { user: other } = await createTestUser({ role: "instructor" });
    const otherQuestion = await createTestQuestion({ createdById: other.userId });

    const notMine = await request(app)
      .post("/api/v1/quizzes")
      .set("Authorization", authHeader(instructor.userId))
      .send({
        kind: "lesson",
        lessonId: lesson.lessonId,
        title: "Quiz",
        questionIds: [...questionIds, otherQuestion.questionId],
      });
    expect(notMine.status).toBe(403);

    const unknown = await request(app)
      .post("/api/v1/quizzes")
      .set("Authorization", authHeader(instructor.userId))
      .send({ kind: "lesson", lessonId: lesson.lessonId, title: "Quiz", questionIds: [9999] });
    expect(unknown.status).toBe(400);

    const repeated = await request(app)
      .post("/api/v1/quizzes")
      .set("Authorization", authHeader(instructor.userId))
      .send({
        kind: "lesson",
        lessonId: lesson.lessonId,
        title: "Quiz",
        questionIds: [questionIds[0], questionIds[0]],
      });
    expect(repeated.status).toBe(400);
  });

  it("lets only admins create the diagnostic, without a lesson, and only once", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const { instructor, lesson, questionIds } = await setUp();
    const body = { kind: "diagnostic", title: "IELTS placement test", questionIds };

    const asInstructor = await request(app)
      .post("/api/v1/quizzes")
      .set("Authorization", authHeader(instructor.userId))
      .send(body);
    expect(asInstructor.status).toBe(403);

    const withLesson = await request(app)
      .post("/api/v1/quizzes")
      .set("Authorization", authHeader(admin.userId))
      .send({ ...body, lessonId: lesson.lessonId });
    expect(withLesson.status).toBe(400);

    const first = await request(app)
      .post("/api/v1/quizzes")
      .set("Authorization", authHeader(admin.userId))
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.quiz.lessonId).toBeNull();

    const second = await request(app)
      .post("/api/v1/quizzes")
      .set("Authorization", authHeader(admin.userId))
      .send(body);
    expect(second.status).toBe(409);
  });

  it("lets only one of two simultaneous diagnostic creations through", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const question = await createTestQuestion({ createdById: admin.userId });
    const send = () =>
      request(app)
        .post("/api/v1/quizzes")
        .set("Authorization", authHeader(admin.userId))
        .send({ kind: "diagnostic", title: "Placement", questionIds: [question.questionId] });

    const results = await Promise.all([send(), send()]);
    const statuses = results.map((res) => res.status).sort();

    expect(statuses).toEqual([201, 409]);
  });
});

describe("GET /api/v1/quizzes/:quizId", () => {
  it("gives an enrolled learner the questions without answers", async () => {
    const { instructor, course, lesson, questionIds } = await setUp("approved");
    const quiz = await createTestQuiz({
      createdById: instructor.userId,
      lessonId: lesson.lessonId,
      questionIds,
    });
    const { user: learner } = await createTestUser();
    await enrollTestUser(learner.userId, course.courseId);

    const res = await request(app)
      .get(`/api/v1/quizzes/${quiz.quizId}`)
      .set("Authorization", authHeader(learner.userId));

    expect(res.status).toBe(200);
    expect(res.body.quiz.questionCount).toBe(2);
    expect(res.body.quiz.createdById).toBeUndefined();
    for (const question of res.body.quiz.questions) {
      expect(question.answerKey).toBeUndefined();
      expect(question.explanation).toBeUndefined();
      expect(question.skills).toBeUndefined();
    }
  });

  it("returns 403 to a learner who isn't enrolled, and 404 on a draft course", async () => {
    const approved = await setUp("approved");
    const approvedQuiz = await createTestQuiz({
      createdById: approved.instructor.userId,
      lessonId: approved.lesson.lessonId,
      questionIds: approved.questionIds,
    });
    const draft = await setUp("draft");
    const draftQuiz = await createTestQuiz({
      createdById: draft.instructor.userId,
      lessonId: draft.lesson.lessonId,
      questionIds: draft.questionIds,
    });
    const { user: learner } = await createTestUser();
    const asLearner = authHeader(learner.userId);

    const notEnrolled = await request(app)
      .get(`/api/v1/quizzes/${approvedQuiz.quizId}`)
      .set("Authorization", asLearner);
    expect(notEnrolled.status).toBe(403);

    const onDraft = await request(app)
      .get(`/api/v1/quizzes/${draftQuiz.quizId}`)
      .set("Authorization", asLearner);
    expect(onDraft.status).toBe(404);
  });

  it("gives another instructor the learner view, and the course owner the author view of an admin's quiz", async () => {
    const { instructor, lesson } = await setUp("approved");
    const { user: admin } = await createTestUser({ role: "admin" });
    const { user: other } = await createTestUser({ role: "instructor" });
    const adminQuestion = await createTestQuestion({ createdById: admin.userId });
    const quiz = await createTestQuiz({
      createdById: admin.userId,
      lessonId: lesson.lessonId,
      questionIds: [adminQuestion.questionId],
    });

    const asOwner = await request(app)
      .get(`/api/v1/quizzes/${quiz.quizId}`)
      .set("Authorization", authHeader(instructor.userId));
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.quiz.questions[0].answerKey).toBe("true");

    const asOther = await request(app)
      .get(`/api/v1/quizzes/${quiz.quizId}`)
      .set("Authorization", authHeader(other.userId));
    expect(asOther.status).toBe(200);
    expect(asOther.body.quiz.questions[0].answerKey).toBeUndefined();
  });
});

describe("PATCH /api/v1/quizzes/:quizId", () => {
  it("updates the title and replaces the question list", async () => {
    const { instructor, lesson, questionIds } = await setUp();
    const quiz = await createTestQuiz({
      createdById: instructor.userId,
      lessonId: lesson.lessonId,
      questionIds,
    });

    const res = await request(app)
      .patch(`/api/v1/quizzes/${quiz.quizId}`)
      .set("Authorization", authHeader(instructor.userId))
      .send({ title: "Renamed quiz", questionIds: [questionIds[1]] });

    expect(res.status).toBe(200);
    expect(res.body.quiz.title).toBe("Renamed quiz");
    expect(res.body.quiz.questions.map((q: { questionId: number }) => q.questionId)).toEqual([
      questionIds[1],
    ]);
  });

  it("returns 403 to an instructor who didn't create it", async () => {
    const { instructor, lesson, questionIds } = await setUp("approved");
    const quiz = await createTestQuiz({
      createdById: instructor.userId,
      lessonId: lesson.lessonId,
      questionIds,
    });
    const { user: other } = await createTestUser({ role: "instructor" });

    const res = await request(app)
      .patch(`/api/v1/quizzes/${quiz.quizId}`)
      .set("Authorization", authHeader(other.userId))
      .send({ title: "Not mine" });

    expect(res.status).toBe(403);
  });

  it("returns 409 on an approved course, and once learners have attempted it", async () => {
    const approved = await setUp("approved");
    const approvedQuiz = await createTestQuiz({
      createdById: approved.instructor.userId,
      lessonId: approved.lesson.lessonId,
      questionIds: approved.questionIds,
    });
    const onApproved = await request(app)
      .patch(`/api/v1/quizzes/${approvedQuiz.quizId}`)
      .set("Authorization", authHeader(approved.instructor.userId))
      .send({ title: "Changed" });
    expect(onApproved.status).toBe(409);

    const draft = await setUp();
    const { user: learner } = await createTestUser();
    const { quiz: attempted } = await createAnsweredQuiz({
      lessonId: draft.lesson.lessonId,
      createdById: draft.instructor.userId,
      learnerId: learner.userId,
    });
    const afterAttempt = await request(app)
      .patch(`/api/v1/quizzes/${attempted.quizId}`)
      .set("Authorization", authHeader(draft.instructor.userId))
      .send({ title: "Changed" });
    expect(afterAttempt.status).toBe(409);
  });
});

describe("DELETE /api/v1/quizzes/:quizId", () => {
  it("deletes the quiz but keeps its questions", async () => {
    const { instructor, lesson, questionIds } = await setUp();
    const quiz = await createTestQuiz({
      createdById: instructor.userId,
      lessonId: lesson.lessonId,
      questionIds,
    });

    const res = await request(app)
      .delete(`/api/v1/quizzes/${quiz.quizId}`)
      .set("Authorization", authHeader(instructor.userId));

    expect(res.status).toBe(200);
    expect(await db.orm.public.Quizzes.first({ quizId: quiz.quizId })).toBeNull();
    expect(await db.orm.public.Questions.all()).toHaveLength(2);
  });

  it("returns 409 once learners have attempted it", async () => {
    const { instructor, lesson } = await setUp();
    const { user: learner } = await createTestUser();
    const { quiz } = await createAnsweredQuiz({
      lessonId: lesson.lessonId,
      createdById: instructor.userId,
      learnerId: learner.userId,
    });

    const res = await request(app)
      .delete(`/api/v1/quizzes/${quiz.quizId}`)
      .set("Authorization", authHeader(instructor.userId));

    expect(res.status).toBe(409);
  });
});

describe("GET /api/v1/diagnostic", () => {
  it("returns 404 until the diagnostic exists", async () => {
    const { user: learner } = await createTestUser();

    const res = await request(app)
      .get("/api/v1/diagnostic")
      .set("Authorization", authHeader(learner.userId));

    expect(res.status).toBe(404);
  });

  it("returns the learner view, then my completed attempt once I have taken it", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const { user: learner } = await createTestUser();
    const question = await createTestQuestion({ createdById: admin.userId });
    const quiz = await createTestQuiz({
      kind: "diagnostic",
      createdById: admin.userId,
      questionIds: [question.questionId],
    });
    const asLearner = authHeader(learner.userId);

    const before = await request(app).get("/api/v1/diagnostic").set("Authorization", asLearner);
    expect(before.status).toBe(200);
    expect(before.body.completedAttemptId).toBeNull();
    expect(before.body.quiz.kind).toBe("diagnostic");
    expect(before.body.quiz.questions[0].answerKey).toBeUndefined();

    // An open attempt doesn't count; a completed one does
    const attempt = await db.orm.public.QuizAttempts.create({
      userId: learner.userId,
      quizId: quiz.quizId,
      completedAt: null,
      totalScore: null,
      maxScore: 1,
      masteryChanges: null,
    });
    const open = await request(app).get("/api/v1/diagnostic").set("Authorization", asLearner);
    expect(open.body.completedAttemptId).toBeNull();

    await db.orm.public.QuizAttempts.where({ attemptId: attempt.attemptId }).update({
      completedAt: Temporal.Now.instant(),
      totalScore: 1,
    });
    const after = await request(app).get("/api/v1/diagnostic").set("Authorization", asLearner);
    expect(after.body.completedAttemptId).toBe(attempt.attemptId);
  });

  it("returns 403 to instructors", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });

    const res = await request(app)
      .get("/api/v1/diagnostic")
      .set("Authorization", authHeader(instructor.userId));

    expect(res.status).toBe(403);
  });
});
