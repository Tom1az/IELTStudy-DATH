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
  resetDb,
} from "../test/db.ts";

beforeEach(async () => {
  await resetDb();
});

// An instructor with a draft course and one lesson in it
const setUpLesson = async () => {
  const { user: instructor } = await createTestUser({ role: "instructor" });
  const course = await createTestCourse({ instructorId: instructor.userId });
  const lesson = await createTestLesson({ courseId: course.courseId });
  return { instructor, course, lesson };
};

describe("POST /api/v1/passages", () => {
  it("creates a reading passage in the instructor's lesson", async () => {
    const { instructor, lesson } = await setUpLesson();

    const res = await request(app)
      .post("/api/v1/passages")
      .set("Authorization", authHeader(instructor.userId))
      .send({
        lessonId: lesson.lessonId,
        type: "reading_text",
        title: "The first coffee houses",
        content: "Coffee was first cultivated in Yemen.",
      });

    expect(res.status).toBe(201);
    expect(res.body.passage).toMatchObject({
      lessonId: lesson.lessonId,
      type: "reading_text",
      content: "Coffee was first cultivated in Yemen.",
      mediaPath: null,
      mediaUrl: null,
      orderIndex: 0,
    });
  });

  it("checks the payload: reading text needs content, audio needs mediaPath", async () => {
    const { instructor, lesson } = await setUpLesson();
    const asInstructor = authHeader(instructor.userId);

    const noContent = await request(app)
      .post("/api/v1/passages")
      .set("Authorization", asInstructor)
      .send({ lessonId: lesson.lessonId, type: "reading_text" });
    expect(noContent.status).toBe(400);

    const noMedia = await request(app)
      .post("/api/v1/passages")
      .set("Authorization", asInstructor)
      .send({ lessonId: lesson.lessonId, type: "listening_audio", content: "Transcript" });
    expect(noMedia.status).toBe(400);

    const audio = await request(app)
      .post("/api/v1/passages")
      .set("Authorization", asInstructor)
      .send({ lessonId: lesson.lessonId, type: "listening_audio", mediaPath: "2/part1.mp3" });
    expect(audio.status).toBe(201);
  });

  it("lets only admins create a passage without a lesson", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: admin } = await createTestUser({ role: "admin" });
    const body = { type: "reading_text", content: "Diagnostic passage" };

    const byInstructor = await request(app)
      .post("/api/v1/passages")
      .set("Authorization", authHeader(instructor.userId))
      .send(body);
    expect(byInstructor.status).toBe(403);

    const byAdmin = await request(app)
      .post("/api/v1/passages")
      .set("Authorization", authHeader(admin.userId))
      .send(body);
    expect(byAdmin.status).toBe(201);
    expect(byAdmin.body.passage.lessonId).toBeNull();
  });

  it("refuses someone else's lesson (403), an approved course (409) and learners (403)", async () => {
    const { user: owner } = await createTestUser({ role: "instructor" });
    const { user: other } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const approved = await createTestCourse({ instructorId: owner.userId, status: "approved" });
    const lesson = await createTestLesson({ courseId: approved.courseId });
    const body = { lessonId: lesson.lessonId, type: "reading_text", content: "Text" };

    const byOther = await request(app)
      .post("/api/v1/passages")
      .set("Authorization", authHeader(other.userId))
      .send(body);
    expect(byOther.status).toBe(403);

    const locked = await request(app)
      .post("/api/v1/passages")
      .set("Authorization", authHeader(owner.userId))
      .send(body);
    expect(locked.status).toBe(409);

    const byLearner = await request(app)
      .post("/api/v1/passages")
      .set("Authorization", authHeader(learner.userId))
      .send(body);
    expect(byLearner.status).toBe(403);
  });
});

describe("PATCH and DELETE /api/v1/passages/:passageId", () => {
  it("checks the payload rule on the passage as it will be after the edit", async () => {
    const { instructor, lesson } = await setUpLesson();
    const asInstructor = authHeader(instructor.userId);
    const created = await request(app)
      .post("/api/v1/passages")
      .set("Authorization", asInstructor)
      .send({ lessonId: lesson.lessonId, type: "reading_text", content: "Text" });
    const passageId = created.body.passage.passageId;

    // Becoming audio without a mediaPath would break the rule
    const toAudio = await request(app)
      .patch(`/api/v1/passages/${passageId}`)
      .set("Authorization", asInstructor)
      .send({ type: "listening_audio" });
    expect(toAudio.status).toBe(400);

    const withMedia = await request(app)
      .patch(`/api/v1/passages/${passageId}`)
      .set("Authorization", asInstructor)
      .send({ type: "listening_audio", mediaPath: "2/part1.mp3" });
    expect(withMedia.status).toBe(200);
    expect(withMedia.body.passage).toMatchObject({
      type: "listening_audio",
      mediaPath: "2/part1.mp3",
    });
  });

  it("returns 403 to another instructor and lets an admin read it", async () => {
    const { instructor, lesson } = await setUpLesson();
    const { user: other } = await createTestUser({ role: "instructor" });
    const { user: admin } = await createTestUser({ role: "admin" });
    const created = await request(app)
      .post("/api/v1/passages")
      .set("Authorization", authHeader(instructor.userId))
      .send({ lessonId: lesson.lessonId, type: "reading_text", content: "Text" });
    const url = `/api/v1/passages/${created.body.passage.passageId}`;

    const byOther = await request(app).get(url).set("Authorization", authHeader(other.userId));
    expect(byOther.status).toBe(403);

    const byAdmin = await request(app).get(url).set("Authorization", authHeader(admin.userId));
    expect(byAdmin.status).toBe(200);
  });

  it("refuses to delete a passage whose questions learners have answered", async () => {
    const { instructor, lesson } = await setUpLesson();
    const { user: learner } = await createTestUser();
    const passage = await db.orm.public.PassagesMedia.create({
      lessonId: lesson.lessonId,
      createdById: instructor.userId,
      type: "reading_text",
      title: null,
      content: "Text",
      mediaPath: null,
    });
    await createAnsweredQuiz({
      lessonId: lesson.lessonId,
      createdById: instructor.userId,
      learnerId: learner.userId,
      passageId: passage.passageId,
    });

    const res = await request(app)
      .delete(`/api/v1/passages/${passage.passageId}`)
      .set("Authorization", authHeader(instructor.userId));

    expect(res.status).toBe(409);
  });

  it("deletes an unused passage", async () => {
    const { instructor, lesson } = await setUpLesson();
    const created = await request(app)
      .post("/api/v1/passages")
      .set("Authorization", authHeader(instructor.userId))
      .send({ lessonId: lesson.lessonId, type: "reading_text", content: "Text" });
    const passageId = created.body.passage.passageId;

    const res = await request(app)
      .delete(`/api/v1/passages/${passageId}`)
      .set("Authorization", authHeader(instructor.userId));

    expect(res.status).toBe(200);
    expect(await db.orm.public.PassagesMedia.first({ passageId })).toBeNull();
  });
});
