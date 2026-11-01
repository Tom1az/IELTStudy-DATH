import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../app.ts";
import { db } from "../prisma/db.ts";
import {
  authHeader,
  createAnsweredQuiz,
  createTestCourse,
  createTestLesson,
  createTestSkill,
  createTestUser,
  enrollTestUser,
  resetDb,
} from "../test/db.ts";

// Never call Supabase from tests (see src/test/fake-storage.ts)
vi.mock("../services/storage.ts", () => import("../test/fake-storage.ts"));

beforeEach(async () => {
  await resetDb();
});

describe("POST /api/v1/courses/:courseId/lessons", () => {
  it("creates a lesson with its skill tags", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const course = await createTestCourse({ instructorId: instructor.userId });
    const skill = await createTestSkill();

    const res = await request(app)
      .post(`/api/v1/courses/${course.courseId}/lessons`)
      .set("Authorization", authHeader(instructor.userId))
      .send({
        title: "Third conditional drill",
        content: "If + past perfect",
        kind: "remedial",
        orderIndex: 0,
        skills: [{ skillId: skill.skillId, weight: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.lesson).toMatchObject({
      courseId: course.courseId,
      title: "Third conditional drill",
      kind: "remedial",
      content: "If + past perfect",
      skills: [{ skillId: skill.skillId, skillCode: skill.skillCode, name: skill.name, weight: 1 }],
      passages: [],
      quizzes: [],
    });
    // Progress and locked are for learners only
    expect(res.body.lesson).not.toHaveProperty("locked");
  });

  it("rejects a repeated skill (400) and an unknown skill (400)", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const course = await createTestCourse({ instructorId: instructor.userId });
    const skill = await createTestSkill();
    const asInstructor = authHeader(instructor.userId);
    const base = { title: "A lesson", kind: "core", orderIndex: 0 };

    const repeated = await request(app)
      .post(`/api/v1/courses/${course.courseId}/lessons`)
      .set("Authorization", asInstructor)
      .send({
        ...base,
        skills: [
          { skillId: skill.skillId, weight: 0.5 },
          { skillId: skill.skillId, weight: 0.5 },
        ],
      });
    expect(repeated.status).toBe(400);

    const unknown = await request(app)
      .post(`/api/v1/courses/${course.courseId}/lessons`)
      .set("Authorization", asInstructor)
      .send({ ...base, skills: [{ skillId: 9999, weight: 1 }] });
    expect(unknown.status).toBe(400);

    const none = await request(app)
      .post(`/api/v1/courses/${course.courseId}/lessons`)
      .set("Authorization", asInstructor)
      .send({ ...base, skills: [] });
    expect(none.status).toBe(400);

    expect(await db.orm.public.Lessons.all()).toHaveLength(0);
  });

  it("returns 409 on an approved course", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    const skill = await createTestSkill();

    const res = await request(app)
      .post(`/api/v1/courses/${course.courseId}/lessons`)
      .set("Authorization", authHeader(instructor.userId))
      .send({
        title: "Late lesson",
        kind: "core",
        orderIndex: 1,
        skills: [{ skillId: skill.skillId, weight: 1 }],
      });

    expect(res.status).toBe(409);
  });
});

describe("PATCH /api/v1/lessons/:lessonId", () => {
  it("replaces the whole skill list", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const course = await createTestCourse({ instructorId: instructor.userId });
    const oldSkill = await createTestSkill();
    const newSkill = await createTestSkill();
    const lesson = await createTestLesson({
      courseId: course.courseId,
      skillIds: [oldSkill.skillId],
    });

    const res = await request(app)
      .patch(`/api/v1/lessons/${lesson.lessonId}`)
      .set("Authorization", authHeader(instructor.userId))
      .send({ title: "Renamed", skills: [{ skillId: newSkill.skillId, weight: 0.8 }] });

    expect(res.status).toBe(200);
    expect(res.body.lesson.title).toBe("Renamed");
    expect(res.body.lesson.skills).toEqual([
      {
        skillId: newSkill.skillId,
        skillCode: newSkill.skillCode,
        name: newSkill.name,
        weight: 0.8,
      },
    ]);
  });

  it("returns 409 when the course is approved", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    const lesson = await createTestLesson({ courseId: course.courseId });

    const res = await request(app)
      .patch(`/api/v1/lessons/${lesson.lessonId}`)
      .set("Authorization", authHeader(instructor.userId))
      .send({ title: "Sneaky edit" });

    expect(res.status).toBe(409);
  });
});

describe("GET /api/v1/courses/:courseId/lessons", () => {
  it("lists core lessons in order, then remedial lessons", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const course = await createTestCourse({ instructorId: instructor.userId });
    const remedial = await createTestLesson({
      courseId: course.courseId,
      kind: "remedial",
      orderIndex: 0,
    });
    const coreSecond = await createTestLesson({ courseId: course.courseId, orderIndex: 1 });
    const coreFirst = await createTestLesson({ courseId: course.courseId, orderIndex: 0 });

    const res = await request(app)
      .get(`/api/v1/courses/${course.courseId}/lessons`)
      .set("Authorization", authHeader(instructor.userId));

    expect(res.status).toBe(200);
    expect(res.body.lessons.map((l: { lessonId: number }) => l.lessonId)).toEqual([
      coreFirst.lessonId,
      coreSecond.lessonId,
      remedial.lessonId,
    ]);
  });

  it("gives learners progress and locked: false", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    await createTestLesson({ courseId: course.courseId });

    const res = await request(app)
      .get(`/api/v1/courses/${course.courseId}/lessons`)
      .set("Authorization", authHeader(learner.userId));

    expect(res.body.lessons[0]).toMatchObject({ progress: null, locked: false });
  });
});

describe("GET /api/v1/lessons/:lessonId", () => {
  it("lets enrolled learners open a lesson, and returns 403 to others", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: enrolled } = await createTestUser();
    const { user: stranger } = await createTestUser();
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    const lesson = await createTestLesson({ courseId: course.courseId });
    await enrollTestUser(enrolled.userId, course.courseId);

    const ok = await request(app)
      .get(`/api/v1/lessons/${lesson.lessonId}`)
      .set("Authorization", authHeader(enrolled.userId));
    expect(ok.status).toBe(200);
    expect(ok.body.lesson).toMatchObject({ content: "Lesson body", locked: false, progress: null });

    const forbidden = await request(app)
      .get(`/api/v1/lessons/${lesson.lessonId}`)
      .set("Authorization", authHeader(stranger.userId));
    expect(forbidden.status).toBe(403);
  });

  it("returns 404 to an enrolled learner once the course is withdrawn", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const course = await createTestCourse({ instructorId: instructor.userId });
    const lesson = await createTestLesson({ courseId: course.courseId });
    await enrollTestUser(learner.userId, course.courseId);

    const res = await request(app)
      .get(`/api/v1/lessons/${lesson.lessonId}`)
      .set("Authorization", authHeader(learner.userId));

    expect(res.status).toBe(404);
  });

  it("lists the lesson's passages and quizzes", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const course = await createTestCourse({ instructorId: instructor.userId });
    const lesson = await createTestLesson({ courseId: course.courseId });
    await createAnsweredQuiz({
      lessonId: lesson.lessonId,
      createdById: instructor.userId,
      learnerId: learner.userId,
    });

    const passages = [
      { type: "reading_text", content: "Text" },
      { type: "listening_audio", mediaPath: "2/part1.mp3" },
      { type: "video", mediaPath: "missing/lecture.mp4" },
    ];
    for (const passage of passages) {
      await request(app)
        .post("/api/v1/passages")
        .set("Authorization", authHeader(instructor.userId))
        .send({ lessonId: lesson.lessonId, ...passage })
        .expect(201);
    }

    const res = await request(app)
      .get(`/api/v1/lessons/${lesson.lessonId}`)
      .set("Authorization", authHeader(instructor.userId));

    // Media is signed on read; a file that can't be signed gets null
    expect(res.body.lesson.passages.map((p: { mediaUrl: string | null }) => p.mediaUrl)).toEqual([
      null,
      "https://storage.test/sign/2/part1.mp3?token=test",
      null,
    ]);
    expect(res.body.lesson.quizzes).toEqual([
      expect.objectContaining({ kind: "lesson", title: "Test quiz", questionCount: 1 }),
    ]);
  });
});

describe("DELETE /api/v1/lessons/:lessonId", () => {
  it("deletes a lesson without learner history", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const course = await createTestCourse({ instructorId: instructor.userId });
    const lesson = await createTestLesson({ courseId: course.courseId });

    const res = await request(app)
      .delete(`/api/v1/lessons/${lesson.lessonId}`)
      .set("Authorization", authHeader(instructor.userId));

    expect(res.status).toBe(200);
    expect(await db.orm.public.Lessons.first({ lessonId: lesson.lessonId })).toBeNull();
  });

  it("returns 409 once a learner has attempted its quiz", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const course = await createTestCourse({ instructorId: instructor.userId });
    const lesson = await createTestLesson({ courseId: course.courseId });
    await createAnsweredQuiz({
      lessonId: lesson.lessonId,
      createdById: instructor.userId,
      learnerId: learner.userId,
    });

    const res = await request(app)
      .delete(`/api/v1/lessons/${lesson.lessonId}`)
      .set("Authorization", authHeader(instructor.userId));

    expect(res.status).toBe(409);
  });
});

describe("PUT /api/v1/lessons/:lessonId/progress", () => {
  it("records progress and completes the enrolment when every core lesson is done", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    const lesson = await createTestLesson({ courseId: course.courseId });
    // Remedial lessons don't count towards completing the course
    await createTestLesson({ courseId: course.courseId, kind: "remedial" });
    await enrollTestUser(learner.userId, course.courseId);
    const asLearner = authHeader(learner.userId);
    const url = `/api/v1/lessons/${lesson.lessonId}/progress`;

    const started = await request(app)
      .put(url)
      .set("Authorization", asLearner)
      .send({ status: "in_progress" });
    expect(started.status).toBe(200);
    expect(started.body.progress).toMatchObject({ status: "in_progress", completedAt: null });

    const completed = await request(app)
      .put(url)
      .set("Authorization", asLearner)
      .send({ status: "completed" });
    expect(completed.body.progress.status).toBe("completed");
    expect(completed.body.progress.completedAt).not.toBeNull();

    const enrollments = await request(app)
      .get("/api/v1/me/enrollments")
      .set("Authorization", asLearner);
    expect(enrollments.status).toBe(200);
    expect(enrollments.body.enrollments[0]).toMatchObject({
      completedLessons: 1,
      totalCoreLessons: 1,
      progressPercent: 100,
    });
    expect(enrollments.body.enrollments[0].completedAt).not.toBeNull();

    // Going back to in_progress clears both completion times
    const reopened = await request(app)
      .put(url)
      .set("Authorization", asLearner)
      .send({ status: "in_progress" });
    expect(reopened.body.progress.completedAt).toBeNull();
    const enrollment = await db.orm.public.Enrollments.first({
      userId: learner.userId,
      courseId: course.courseId,
    });
    expect(enrollment!.completedAt).toBeNull();
  });

  it("returns 403 to a learner who isn't enrolled, and to instructors", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    const lesson = await createTestLesson({ courseId: course.courseId });

    for (const user of [learner, instructor]) {
      const res = await request(app)
        .put(`/api/v1/lessons/${lesson.lessonId}/progress`)
        .set("Authorization", authHeader(user.userId))
        .send({ status: "completed" });
      expect(res.status).toBe(403);
    }
  });
});
