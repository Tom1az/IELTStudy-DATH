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

describe("admin routes: roles", () => {
  it.each([
    ["GET", "/api/v1/admin/users"],
    ["PATCH", "/api/v1/admin/users/1"],
    ["GET", "/api/v1/admin/stats"],
  ])(
    "%s %s returns 401 without a token and 403 to learners and instructors",
    async (method, path) => {
      const { user: learner } = await createTestUser();
      const { user: instructor } = await createTestUser({ role: "instructor" });
      const send = (header?: string) => {
        const req = method === "GET" ? request(app).get(path) : request(app).patch(path);
        if (header) req.set("Authorization", header);
        return req.send({ role: "admin" });
      };

      expect((await send()).status).toBe(401);
      expect((await send(authHeader(learner.userId))).status).toBe(403);
      expect((await send(authHeader(instructor.userId))).status).toBe(403);
    },
  );
});

describe("GET /api/v1/admin/users", () => {
  it("lists every user in id order, with exactly the contract's User fields", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    await createTestUser();
    await createTestUser({ role: "instructor" });

    const res = await request(app)
      .get("/api/v1/admin/users")
      .set("Authorization", authHeader(admin.userId));

    expect(res.status).toBe(200);
    expect(res.body.users.map((u: { userId: number }) => u.userId)).toEqual([1, 2, 3]);
    for (const user of res.body.users) {
      expect(Object.keys(user).sort()).toEqual(
        ["createdAt", "email", "fullName", "isActive", "role", "targetBand", "userId"].sort(),
      );
    }
  });

  it("filters by role and by active status", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const { user: learner } = await createTestUser();
    const { user: inactive } = await createTestUser({ isActive: false });
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const header = authHeader(admin.userId);

    const learners = await request(app)
      .get("/api/v1/admin/users?role=learner")
      .set("Authorization", header);
    expect(learners.body.users.map((u: { userId: number }) => u.userId)).toEqual([
      learner.userId,
      inactive.userId,
    ]);

    const deactivated = await request(app)
      .get("/api/v1/admin/users?isActive=false")
      .set("Authorization", header);
    expect(deactivated.body.users.map((u: { userId: number }) => u.userId)).toEqual([
      inactive.userId,
    ]);

    const both = await request(app)
      .get("/api/v1/admin/users?role=instructor&isActive=true")
      .set("Authorization", header);
    expect(both.body.users.map((u: { userId: number }) => u.userId)).toEqual([instructor.userId]);
  });

  it.each([
    ["an unknown role", "?role=superuser"],
    ["a non-boolean isActive", "?isActive=maybe"],
    ["an unknown filter", "?email=a@test.dev"],
  ])("returns 400 for %s", async (_label, query) => {
    const { user: admin } = await createTestUser({ role: "admin" });

    const res = await request(app)
      .get(`/api/v1/admin/users${query}`)
      .set("Authorization", authHeader(admin.userId));

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/v1/admin/users/{userId}", () => {
  it("promotes a learner, who can use instructor routes on their next request", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const { user: learner } = await createTestUser();
    const learnerHeader = authHeader(learner.userId);

    const before = await request(app)
      .get("/api/v1/instructor/courses")
      .set("Authorization", learnerHeader);
    expect(before.status).toBe(403);

    const res = await request(app)
      .patch(`/api/v1/admin/users/${learner.userId}`)
      .set("Authorization", authHeader(admin.userId))
      .send({ role: "instructor" });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ userId: learner.userId, role: "instructor" });
    expect(res.body.user.hashedPass).toBeUndefined();

    // Same token as before: the role is read from the database, not from the token
    const after = await request(app)
      .get("/api/v1/instructor/courses")
      .set("Authorization", learnerHeader);
    expect(after.status).toBe(200);
  });

  it("deactivates a user (their token and login stop working) and reactivates them", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const { user, password } = await createTestUser();
    const adminHeader = authHeader(admin.userId);

    const off = await request(app)
      .patch(`/api/v1/admin/users/${user.userId}`)
      .set("Authorization", adminHeader)
      .send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.user.isActive).toBe(false);

    const me = await request(app).get("/api/v1/me").set("Authorization", authHeader(user.userId));
    expect(me.status).toBe(401);
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password });
    expect(login.status).toBe(403);

    const on = await request(app)
      .patch(`/api/v1/admin/users/${user.userId}`)
      .set("Authorization", adminHeader)
      .send({ isActive: true });
    expect(on.status).toBe(200);
    const meAgain = await request(app)
      .get("/api/v1/me")
      .set("Authorization", authHeader(user.userId));
    expect(meAgain.status).toBe(200);
  });

  it("lets an admin demote another admin", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const { user: otherAdmin } = await createTestUser({ role: "admin" });

    const res = await request(app)
      .patch(`/api/v1/admin/users/${otherAdmin.userId}`)
      .set("Authorization", authHeader(admin.userId))
      .send({ role: "learner" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("learner");
  });

  it.each([
    ["a role change", { role: "learner" }],
    ["a deactivation", { isActive: false }],
    ["a no-op", { role: "admin", isActive: true }],
  ])(
    "returns 409 when admins target themselves (%s), and nothing changes",
    async (_label, body) => {
      const { user: admin } = await createTestUser({ role: "admin" });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${admin.userId}`)
        .set("Authorization", authHeader(admin.userId))
        .send(body);

      expect(res.status).toBe(409);
      const row = await db.orm.public.Users.first({ userId: admin.userId });
      expect(row).toMatchObject({ role: "admin", isActive: true });
    },
  );

  it("returns 404 for an unknown user", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });

    const res = await request(app)
      .patch("/api/v1/admin/users/999")
      .set("Authorization", authHeader(admin.userId))
      .send({ role: "instructor" });

    expect(res.status).toBe(404);
  });

  it.each([
    ["an empty body", {}],
    ["an unknown role", { role: "superuser" }],
    ["a field that can't be changed here", { email: "new@test.dev" }],
    ["a non-boolean isActive", { isActive: "maybe" }],
  ])("returns 400 for %s", async (_label, body) => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const { user } = await createTestUser();

    const res = await request(app)
      .patch(`/api/v1/admin/users/${user.userId}`)
      .set("Authorization", authHeader(admin.userId))
      .send(body);

    expect(res.status).toBe(400);
  });

  it("returns 400 for a user id that isn't a positive integer", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });

    const res = await request(app)
      .patch("/api/v1/admin/users/abc")
      .set("Authorization", authHeader(admin.userId))
      .send({ role: "instructor" });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/admin/stats", () => {
  it("reports 0 for every group that has no rows", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });

    const res = await request(app)
      .get("/api/v1/admin/stats")
      .set("Authorization", authHeader(admin.userId));

    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual({
      users: { total: 1, active: 1, inactive: 0, byRole: { learner: 0, instructor: 0, admin: 1 } },
      courses: {
        total: 0,
        byStatus: { draft: 0, pending_review: 0, approved: 0, rejected: 0, archived: 0 },
      },
      enrollments: 0,
      attempts: { completed: 0, completedLast7Days: 0 },
      activeLearnersLast7Days: 0,
    });
  });

  it("counts users, courses, enrolments, completed attempts and recent learners", async () => {
    const orm = db.orm.public;
    const { user: admin } = await createTestUser({ role: "admin" });
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: busyLearner } = await createTestUser();
    const { user: oldLearner } = await createTestUser();
    const { user: idleLearner } = await createTestUser();
    await createTestUser({ isActive: false });

    const approved = await createTestCourse({
      instructorId: instructor.userId,
      status: "approved",
    });
    await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    await createTestCourse({ instructorId: instructor.userId, status: "draft" });
    await createTestCourse({ instructorId: instructor.userId, status: "pending_review" });
    const lesson = await createTestLesson({ courseId: approved.courseId });
    await enrollTestUser(busyLearner.userId, approved.courseId);
    await enrollTestUser(oldLearner.userId, approved.courseId);
    await enrollTestUser(idleLearner.userId, approved.courseId);

    // busyLearner: two completed attempts now, counted once as an active learner
    const first = await createAnsweredQuiz({
      lessonId: lesson.lessonId,
      createdById: instructor.userId,
      learnerId: busyLearner.userId,
    });
    await createAnsweredQuiz({
      lessonId: lesson.lessonId,
      createdById: instructor.userId,
      learnerId: busyLearner.userId,
    });

    // oldLearner: one attempt completed 8 days ago, outside the 7-day window
    const old = await createAnsweredQuiz({
      lessonId: lesson.lessonId,
      createdById: instructor.userId,
      learnerId: oldLearner.userId,
    });
    // started_at can't be set through the ORM (the database fills it in), so both times are
    // moved back in SQL. Both move together, which keeps completed_at >= started_at.
    await db.runtime().execute(
      db.raw.sql`
        UPDATE quiz_attempts
        SET started_at = started_at - interval '8 days',
            completed_at = completed_at - interval '8 days'
        WHERE attempt_id = ${old.attempt.attemptId}
      `
        .affectedCount()
        .build(),
    );

    // idleLearner: an open attempt, which isn't counted
    await orm.QuizAttempts.create({
      userId: idleLearner.userId,
      quizId: first.quiz.quizId,
      completedAt: null,
      totalScore: null,
      maxScore: 1,
      masteryChanges: null,
    });

    const res = await request(app)
      .get("/api/v1/admin/stats")
      .set("Authorization", authHeader(admin.userId));

    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual({
      users: { total: 6, active: 5, inactive: 1, byRole: { learner: 4, instructor: 1, admin: 1 } },
      courses: {
        total: 4,
        byStatus: { draft: 1, pending_review: 1, approved: 2, rejected: 0, archived: 0 },
      },
      enrollments: 3,
      attempts: { completed: 3, completedLast7Days: 2 },
      activeLearnersLast7Days: 1,
    });
  });
});
