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

const auditOf = async (adminId: number, query = "") => {
  const res = await request(app).get(`/api/v1/admin/audit${query}`).set("Authorization", authHeader(adminId));
  expect(res.status).toBe(200);
  return res.body.entries as Array<{
    action: string;
    actor: { userId: number } | null;
    targetType: string;
    targetId: number;
    summary: string;
    details: Record<string, unknown> | null;
  }>;
};

describe("admin audit log", () => {
  it("records role changes and (de)activations, newest first, and nothing for a no-op", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const { user: target } = await createTestUser();
    const header = authHeader(admin.userId);

    await request(app).patch(`/api/v1/admin/users/${target.userId}`).set("Authorization", header).send({ role: "instructor" });
    await request(app).patch(`/api/v1/admin/users/${target.userId}`).set("Authorization", header).send({ isActive: false });
    await request(app).patch(`/api/v1/admin/users/${target.userId}`).set("Authorization", header).send({ isActive: false });
    await request(app).patch(`/api/v1/admin/users/${target.userId}`).set("Authorization", header).send({ isActive: true });

    const entries = await auditOf(admin.userId);
    expect(entries.map((e) => e.action)).toEqual(["user.activate", "user.deactivate", "user.role_change"]);
    expect(entries[2]).toMatchObject({
      actor: { userId: admin.userId },
      targetType: "user",
      targetId: target.userId,
      details: { from: "learner", to: "instructor" },
    });
    expect(entries[2]!.summary).toContain(target.email);
  });

  it("records approve, reject and an admin's archive, and filters by action and actor", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const { user: otherAdmin } = await createTestUser({ role: "admin" });
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const a = await createTestCourse({ instructorId: instructor.userId, status: "pending_review" });
    const b = await createTestCourse({ instructorId: instructor.userId, status: "pending_review" });

    await request(app).post(`/api/v1/courses/${a.courseId}/approve`).set("Authorization", authHeader(admin.userId)).send({});
    await request(app).post(`/api/v1/courses/${b.courseId}/reject`).set("Authorization", authHeader(otherAdmin.userId)).send({ feedback: "Add a quiz" });
    await request(app).post(`/api/v1/courses/${a.courseId}/archive`).set("Authorization", authHeader(admin.userId));
    // The owner archiving their own course is not an admin action
    await request(app).post(`/api/v1/courses/${b.courseId}/archive`).set("Authorization", authHeader(instructor.userId));

    const all = await auditOf(admin.userId);
    expect(all.map((e) => e.action)).toEqual(["course.archive", "course.reject", "course.approve"]);

    const rejects = await auditOf(admin.userId, "?action=course.reject");
    expect(rejects).toHaveLength(1);
    expect(rejects[0]!.details).toEqual({ feedback: "Add a quiz" });

    const byOther = await auditOf(admin.userId, `?actorId=${otherAdmin.userId}`);
    expect(byOther.map((e) => e.action)).toEqual(["course.reject"]);
  });

  it("writes nothing when the change fails (409)", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const draft = await createTestCourse({ instructorId: instructor.userId });

    const res = await request(app).post(`/api/v1/courses/${draft.courseId}/approve`).set("Authorization", authHeader(admin.userId)).send({});
    expect(res.status).toBe(409);
    expect(await auditOf(admin.userId)).toEqual([]);
  });

  it("is for admins only", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const res = await request(app).get("/api/v1/admin/audit").set("Authorization", authHeader(instructor.userId));
    expect(res.status).toBe(403);
  });
});

describe("review notifications", () => {
  it("tells the instructor about approve and reject, and enrolled learners about new lessons", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const course = await createTestCourse({ instructorId: instructor.userId, status: "pending_review" });
    await createTestLesson({ courseId: course.courseId });
    const asAdmin = authHeader(admin.userId);
    const asOwner = authHeader(instructor.userId);

    await request(app).post(`/api/v1/courses/${course.courseId}/approve`).set("Authorization", asAdmin).send({});
    await enrollTestUser(learner.userId, course.courseId);

    // The owner withdraws, adds a lesson, resubmits; the admin rejects once, then approves
    await request(app).post(`/api/v1/courses/${course.courseId}/withdraw`).set("Authorization", asOwner);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await createTestLesson({ courseId: course.courseId, orderIndex: 1 });
    await request(app).post(`/api/v1/courses/${course.courseId}/submit`).set("Authorization", asOwner);
    await request(app).post(`/api/v1/courses/${course.courseId}/reject`).set("Authorization", asAdmin).send({ feedback: "Typo" });
    await request(app).post(`/api/v1/courses/${course.courseId}/submit`).set("Authorization", asOwner);
    const approved = await request(app).post(`/api/v1/courses/${course.courseId}/approve`).set("Authorization", asAdmin).send({});
    expect(approved.status).toBe(200);

    const ownerList = await request(app).get("/api/v1/me/notifications").set("Authorization", asOwner);
    expect(ownerList.body.notifications.map((n: { type: string }) => n.type)).toEqual([
      "course.approved",
      "course.rejected",
      "course.approved",
    ]);
    const learnerList = await request(app).get("/api/v1/me/notifications").set("Authorization", authHeader(learner.userId));
    expect(learnerList.body.notifications).toHaveLength(1);
    expect(learnerList.body.notifications[0]).toMatchObject({
      type: "course.new_lessons",
      body: "1 new lesson added.",
      link: `/courses/${course.courseId}`,
    });
    expect(await db.orm.public.Notifications.where({ userId: admin.userId }).all()).toEqual([]);
  });
});
