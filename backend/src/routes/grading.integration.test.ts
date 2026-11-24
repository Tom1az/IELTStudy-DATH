import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../app.ts";
import { db } from "../prisma/db.ts";
import {
  authHeader,
  createAnsweredQuiz,
  createTestCourse,
  createTestLesson,
  createTestUser,
  enrollTestUser,
  resetDb,
} from "../test/db.ts";

beforeEach(async () => {
  await resetDb();
});

const setUp = async () => {
  const { user: instructor } = await createTestUser({ role: "instructor" });
  const { user: otherInstructor } = await createTestUser({ role: "instructor" });
  const { user: learner } = await createTestUser();
  const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
  const lesson = await createTestLesson({ courseId: course.courseId });
  await enrollTestUser(learner.userId, course.courseId);
  const { quiz, attempt } = await createAnsweredQuiz({
    lessonId: lesson.lessonId,
    createdById: instructor.userId,
    learnerId: learner.userId,
  });
  // Another instructor's course with its own submission
  const otherCourse = await createTestCourse({ instructorId: otherInstructor.userId, status: "approved" });
  const otherLesson = await createTestLesson({ courseId: otherCourse.courseId });
  const other = await createAnsweredQuiz({
    lessonId: otherLesson.lessonId,
    createdById: otherInstructor.userId,
    learnerId: learner.userId,
  });
  return { instructor, otherInstructor, learner, course, lesson, quiz, attempt, otherAttempt: other.attempt };
};

describe("instructor grading", () => {
  it("lists only submissions on my quizzes, filtered by course and quiz", async () => {
    const { instructor, learner, course, quiz, attempt } = await setUp();
    const header = authHeader(instructor.userId);

    const res = await request(app).get("/api/v1/instructor/submissions").set("Authorization", header);
    expect(res.status).toBe(200);
    expect(res.body.submissions).toHaveLength(1);
    expect(res.body.submissions[0]).toMatchObject({
      attemptId: attempt.attemptId,
      learner: { userId: learner.userId, email: learner.email },
      course: { courseId: course.courseId },
      quiz: { quizId: quiz.quizId },
      totalScore: 1,
      maxScore: 1,
      feedback: null,
    });

    const filtered = await request(app).get(`/api/v1/instructor/submissions?quizId=${quiz.quizId + 100}`).set("Authorization", header);
    expect(filtered.body.submissions).toEqual([]);
  });

  it("shows one submission with its answers, 403 for another instructor's, 404 for an open attempt", async () => {
    const { instructor, otherAttempt, attempt, learner, quiz } = await setUp();
    const header = authHeader(instructor.userId);

    const mine = await request(app).get(`/api/v1/instructor/submissions/${attempt.attemptId}`).set("Authorization", header);
    expect(mine.status).toBe(200);
    expect(mine.body.result.responses).toHaveLength(1);
    expect(mine.body.submission.attemptId).toBe(attempt.attemptId);

    const theirs = await request(app).get(`/api/v1/instructor/submissions/${otherAttempt.attemptId}`).set("Authorization", header);
    expect(theirs.status).toBe(403);

    const open = await db.orm.public.QuizAttempts.create({
      userId: learner.userId,
      quizId: quiz.quizId,
      completedAt: null,
      totalScore: null,
      maxScore: 1,
      masteryChanges: null,
    });
    const notSubmitted = await request(app).get(`/api/v1/instructor/submissions/${open.attemptId}`).set("Authorization", header);
    expect(notSubmitted.status).toBe(404);
  });

  it("saves and replaces feedback, notifies the learner, and the learner reads it", async () => {
    const { instructor, learner, attempt, otherInstructor } = await setUp();
    const header = authHeader(instructor.userId);

    const first = await request(app)
      .put(`/api/v1/instructor/submissions/${attempt.attemptId}/feedback`)
      .set("Authorization", header)
      .send({ comment: "Good work", totalScore: null });
    expect(first.status).toBe(200);
    expect(first.body.feedback).toMatchObject({
      attemptId: attempt.attemptId,
      comment: "Good work",
      totalScore: null,
      gradedBy: { userId: instructor.userId },
    });

    const second = await request(app)
      .put(`/api/v1/instructor/submissions/${attempt.attemptId}/feedback`)
      .set("Authorization", header)
      .send({ comment: "", totalScore: 0 });
    expect(second.body.feedback).toMatchObject({ comment: "", totalScore: 0 });
    expect(await db.orm.public.AttemptFeedback.where({ attemptId: attempt.attemptId }).all()).toHaveLength(1);

    const tooHigh = await request(app)
      .put(`/api/v1/instructor/submissions/${attempt.attemptId}/feedback`)
      .set("Authorization", header)
      .send({ comment: "x", totalScore: 5 });
    expect(tooHigh.status).toBe(400);

    const notMine = await request(app)
      .put(`/api/v1/instructor/submissions/${attempt.attemptId}/feedback`)
      .set("Authorization", authHeader(otherInstructor.userId))
      .send({ comment: "x" });
    expect(notMine.status).toBe(403);

    const asLearner = authHeader(learner.userId);
    const read = await request(app).get(`/api/v1/attempts/${attempt.attemptId}/feedback`).set("Authorization", asLearner);
    expect(read.status).toBe(200);
    expect(read.body.feedback).toMatchObject({ totalScore: 0, gradedBy: { userId: instructor.userId } });

    const notes = await request(app).get("/api/v1/me/notifications").set("Authorization", asLearner);
    expect(notes.body.notifications.map((n: { type: string; link: string }) => [n.type, n.link])).toEqual([
      ["attempt.feedback", `/practice/result/${attempt.attemptId}`],
      ["attempt.feedback", `/practice/result/${attempt.attemptId}`],
    ]);
  });

  it("gives null feedback before any is written, and 403 to another learner", async () => {
    const { attempt, learner } = await setUp();
    const { user: stranger } = await createTestUser();
    const none = await request(app).get(`/api/v1/attempts/${attempt.attemptId}/feedback`).set("Authorization", authHeader(learner.userId));
    expect(none.body.feedback).toBeNull();
    const other = await request(app).get(`/api/v1/attempts/${attempt.attemptId}/feedback`).set("Authorization", authHeader(stranger.userId));
    expect(other.status).toBe(403);
  });

  it("lists my learners with progress per course of mine only", async () => {
    const { instructor, learner, course, lesson } = await setUp();
    await createTestLesson({ courseId: course.courseId, orderIndex: 1 });
    await db.orm.public.LessonProgress.create({
      userId: learner.userId,
      lessonId: lesson.lessonId,
      status: "completed",
      completedAt: Temporal.Now.instant(),
    });

    const res = await request(app).get("/api/v1/instructor/learners").set("Authorization", authHeader(instructor.userId));
    expect(res.status).toBe(200);
    expect(res.body.learners).toHaveLength(1);
    expect(res.body.learners[0]).toMatchObject({
      user: { userId: learner.userId },
      courses: [{ courseId: course.courseId, completedLessons: 1, totalCoreLessons: 2, progressPercent: 50 }],
      completedAttempts: 1,
    });
    expect(res.body.learners[0].lastActiveAt).not.toBeNull();
  });

  it("is for instructors only", async () => {
    const { learner } = await setUp();
    const res = await request(app).get("/api/v1/instructor/submissions").set("Authorization", authHeader(learner.userId));
    expect(res.status).toBe(403);
  });
});
