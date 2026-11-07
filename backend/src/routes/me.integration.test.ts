import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../app.ts";
import { db } from "../prisma/db.ts";
import {
  authHeader,
  createTestCourse,
  createTestLesson,
  createTestUser,
  enrollTestUser,
  resetDb,
} from "../test/db.ts";

beforeEach(async () => {
  await resetDb();
});

describe("GET /api/v1/me", () => {
  it("returns the logged-in user with exactly the contract's User fields", async () => {
    const { user } = await createTestUser({ role: "instructor" });

    const res = await request(app).get("/api/v1/me").set("Authorization", authHeader(user.userId));

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.user).sort()).toEqual(
      ["createdAt", "email", "fullName", "isActive", "role", "targetBand", "userId"].sort(),
    );
    expect(res.body.user.role).toBe("instructor");
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/v1/me");

    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/v1/me", () => {
  it("updates the name and target band", async () => {
    const { user } = await createTestUser();

    const res = await request(app)
      .patch("/api/v1/me")
      .set("Authorization", authHeader(user.userId))
      .send({ fullName: "  Lena Learner ", targetBand: 6.5 });

    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe("Lena Learner");
    expect(res.body.user.targetBand).toBe(6.5);

    const me = await request(app).get("/api/v1/me").set("Authorization", authHeader(user.userId));
    expect(me.body.user.targetBand).toBe(6.5);
  });

  it("clears the target band with null", async () => {
    const { user } = await createTestUser();
    const header = authHeader(user.userId);
    await request(app).patch("/api/v1/me").set("Authorization", header).send({ targetBand: 7 });

    const res = await request(app)
      .patch("/api/v1/me")
      .set("Authorization", header)
      .send({ targetBand: null });

    expect(res.status).toBe(200);
    expect(res.body.user.targetBand).toBeNull();
  });

  it.each([
    ["a band that isn't a half step", { targetBand: 6.3 }],
    ["a band above 9", { targetBand: 9.5 }],
    ["an empty body", {}],
    ["a field that can't be changed here", { email: "new@test.dev" }],
    ["a role change", { role: "admin" }],
  ])("returns 400 for %s", async (_label, body) => {
    const { user } = await createTestUser();

    const res = await request(app)
      .patch("/api/v1/me")
      .set("Authorization", authHeader(user.userId))
      .send(body);

    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/me/enrollments", () => {
  it("reports completed core lessons as a percentage", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    const done = await createTestLesson({ courseId: course.courseId, orderIndex: 0 });
    await createTestLesson({ courseId: course.courseId, orderIndex: 1 });
    await enrollTestUser(learner.userId, course.courseId);
    await db.orm.public.LessonProgress.create({
      userId: learner.userId,
      lessonId: done.lessonId,
      status: "completed",
      completedAt: Temporal.Now.instant(),
    });

    const res = await request(app)
      .get("/api/v1/me/enrollments")
      .set("Authorization", authHeader(learner.userId));

    expect(res.status).toBe(200);
    expect(res.body.enrollments).toHaveLength(1);
    expect(res.body.enrollments[0]).toMatchObject({
      course: { courseId: course.courseId, isEnrolled: true },
      completedLessons: 1,
      totalCoreLessons: 2,
      progressPercent: 50,
      completedAt: null,
    });
  });

  it("returns 403 to instructors", async () => {
    const { user } = await createTestUser({ role: "instructor" });

    const res = await request(app)
      .get("/api/v1/me/enrollments")
      .set("Authorization", authHeader(user.userId));

    expect(res.status).toBe(403);
  });
});
