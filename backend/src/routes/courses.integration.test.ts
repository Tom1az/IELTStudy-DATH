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

const courseInput = {
  title: "Listening Essentials",
  description: "Strategies for all four parts.",
  targetLevel: "intermediate",
};

describe("course review flow", () => {
  it("goes draft -> pending_review -> rejected -> pending_review -> approved -> draft", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: admin } = await createTestUser({ role: "admin" });
    const asInstructor = authHeader(instructor.userId);
    const asAdmin = authHeader(admin.userId);

    // Create a draft
    const created = await request(app)
      .post("/api/v1/courses")
      .set("Authorization", asInstructor)
      .send(courseInput);
    expect(created.status).toBe(201);
    expect(created.body.course).toMatchObject({
      title: "Listening Essentials",
      status: "draft",
      lessonCount: 0,
      instructor: { userId: instructor.userId },
      submittedAt: null,
      reviewedAt: null,
    });
    expect(created.body.course).not.toHaveProperty("isEnrolled");
    const courseId = created.body.course.courseId;

    // Submitting needs a core lesson
    const empty = await request(app)
      .post(`/api/v1/courses/${courseId}/submit`)
      .set("Authorization", asInstructor);
    expect(empty.status).toBe(409);

    await createTestLesson({ courseId });
    const submitted = await request(app)
      .post(`/api/v1/courses/${courseId}/submit`)
      .set("Authorization", asInstructor);
    expect(submitted.status).toBe(200);
    expect(submitted.body.course.status).toBe("pending_review");
    expect(submitted.body.course.submittedAt).not.toBeNull();
    expect(submitted.body.course.lessonCount).toBe(1);

    // Locked while waiting for review
    const editWhilePending = await request(app)
      .patch(`/api/v1/courses/${courseId}`)
      .set("Authorization", asInstructor)
      .send({ title: "New title" });
    expect(editWhilePending.status).toBe(409);

    // The admin sees it in the review queue
    const queue = await request(app)
      .get("/api/v1/admin/courses?status=pending_review")
      .set("Authorization", asAdmin);
    expect(queue.status).toBe(200);
    expect(queue.body.courses.map((c: { courseId: number }) => c.courseId)).toEqual([courseId]);

    // Reject with feedback
    const rejected = await request(app)
      .post(`/api/v1/courses/${courseId}/reject`)
      .set("Authorization", asAdmin)
      .send({ feedback: "Add a skill tag to lesson 1." });
    expect(rejected.status).toBe(200);
    expect(rejected.body.course).toMatchObject({
      status: "rejected",
      reviewFeedback: "Add a skill tag to lesson 1.",
    });
    expect(rejected.body.course.reviewedAt).not.toBeNull();

    // The owner sees the feedback, edits and resubmits
    const mine = await request(app)
      .get("/api/v1/instructor/courses")
      .set("Authorization", asInstructor);
    expect(mine.body.courses[0].reviewFeedback).toBe("Add a skill tag to lesson 1.");

    const edited = await request(app)
      .patch(`/api/v1/courses/${courseId}`)
      .set("Authorization", asInstructor)
      .send({ title: "Listening Essentials v2" });
    expect(edited.status).toBe(200);
    expect(edited.body.course.title).toBe("Listening Essentials v2");

    const resubmitted = await request(app)
      .post(`/api/v1/courses/${courseId}/submit`)
      .set("Authorization", asInstructor);
    expect(resubmitted.body.course.status).toBe("pending_review");

    // Approve without feedback
    const approved = await request(app)
      .post(`/api/v1/courses/${courseId}/approve`)
      .set("Authorization", asAdmin);
    expect(approved.status).toBe(200);
    expect(approved.body.course).toMatchObject({ status: "approved", reviewFeedback: null });

    const row = await db.orm.public.Courses.first({ courseId });
    expect(row!.reviewedById).toBe(admin.userId);

    // Approved courses are locked until withdrawn
    const editApproved = await request(app)
      .patch(`/api/v1/courses/${courseId}`)
      .set("Authorization", asInstructor)
      .send({ title: "Another title" });
    expect(editApproved.status).toBe(409);

    const withdrawn = await request(app)
      .post(`/api/v1/courses/${courseId}/withdraw`)
      .set("Authorization", asInstructor);
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.course.status).toBe("draft");
  });

  it("requires feedback to reject", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: admin } = await createTestUser({ role: "admin" });
    const course = await createTestCourse({
      instructorId: instructor.userId,
      status: "pending_review",
    });

    const res = await request(app)
      .post(`/api/v1/courses/${course.courseId}/reject`)
      .set("Authorization", authHeader(admin.userId))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Validation failed");
  });

  it("returns 409 for a transition from the wrong status", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: admin } = await createTestUser({ role: "admin" });
    const draft = await createTestCourse({ instructorId: instructor.userId });
    const approved = await createTestCourse({
      instructorId: instructor.userId,
      status: "approved",
    });
    await createTestLesson({ courseId: approved.courseId });
    const asInstructor = authHeader(instructor.userId);
    const asAdmin = authHeader(admin.userId);

    const cases = [
      { path: `/api/v1/courses/${draft.courseId}/approve`, auth: asAdmin, body: {} },
      { path: `/api/v1/courses/${draft.courseId}/reject`, auth: asAdmin, body: { feedback: "x" } },
      { path: `/api/v1/courses/${draft.courseId}/withdraw`, auth: asInstructor, body: {} },
      { path: `/api/v1/courses/${approved.courseId}/submit`, auth: asInstructor, body: {} },
      { path: `/api/v1/courses/${approved.courseId}/approve`, auth: asAdmin, body: {} },
    ];
    for (const testCase of cases) {
      const res = await request(app)
        .post(testCase.path)
        .set("Authorization", testCase.auth)
        .send(testCase.body);
      expect(res.status, testCase.path).toBe(409);
    }
  });
});

describe("concurrent requests", () => {
  it("lets only one of two conflicting reviews win", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: admin } = await createTestUser({ role: "admin" });
    const course = await createTestCourse({
      instructorId: instructor.userId,
      status: "pending_review",
    });
    const asAdmin = authHeader(admin.userId);

    // Approve and reject at the same moment: both need pending_review, so exactly one wins
    const [approve, reject] = await Promise.all([
      request(app).post(`/api/v1/courses/${course.courseId}/approve`).set("Authorization", asAdmin),
      request(app)
        .post(`/api/v1/courses/${course.courseId}/reject`)
        .set("Authorization", asAdmin)
        .send({ feedback: "Needs more lessons" }),
    ]);

    expect([approve.status, reject.status].sort()).toEqual([200, 409]);
    const row = await db.orm.public.Courses.first({ courseId: course.courseId });
    expect(row!.status).toBe(approve.status === 200 ? "approved" : "rejected");
  });

  it("enrols once when a learner sends two enrol requests at the same moment", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    const url = `/api/v1/courses/${course.courseId}/enroll`;

    const responses = await Promise.all([
      request(app).post(url).set("Authorization", authHeader(learner.userId)),
      request(app).post(url).set("Authorization", authHeader(learner.userId)),
    ]);

    const statuses = responses.map((res) => res.status).sort();
    expect(statuses).toEqual([200, 201]);
  });
});

describe("course permissions", () => {
  it("lets only instructors create courses", async () => {
    const { user: learner } = await createTestUser();
    const { user: admin } = await createTestUser({ role: "admin" });

    for (const user of [learner, admin]) {
      const res = await request(app)
        .post("/api/v1/courses")
        .set("Authorization", authHeader(user.userId))
        .send(courseInput);
      expect(res.status).toBe(403);
    }
  });

  it("returns 403 when another instructor or an admin edits a course", async () => {
    const { user: owner } = await createTestUser({ role: "instructor" });
    const { user: other } = await createTestUser({ role: "instructor" });
    const { user: admin } = await createTestUser({ role: "admin" });
    const approved = await createTestCourse({ instructorId: owner.userId, status: "approved" });
    const draft = await createTestCourse({ instructorId: owner.userId });

    // Another instructor can see an approved course but not change it
    const otherEdit = await request(app)
      .post(`/api/v1/courses/${approved.courseId}/withdraw`)
      .set("Authorization", authHeader(other.userId));
    expect(otherEdit.status).toBe(403);

    // Admins review courses; they don't edit them (docs/ERD.md, "Content edit rights")
    const adminEdit = await request(app)
      .patch(`/api/v1/courses/${draft.courseId}`)
      .set("Authorization", authHeader(admin.userId))
      .send({ title: "Admin title" });
    expect(adminEdit.status).toBe(403);
  });

  it("hides courses that aren't approved from everyone but the owner and admins", async () => {
    const { user: owner } = await createTestUser({ role: "instructor" });
    const { user: other } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const { user: admin } = await createTestUser({ role: "admin" });
    const draft = await createTestCourse({ instructorId: owner.userId });

    for (const user of [other, learner]) {
      const res = await request(app)
        .get(`/api/v1/courses/${draft.courseId}`)
        .set("Authorization", authHeader(user.userId));
      expect(res.status).toBe(404);
    }
    for (const user of [owner, admin]) {
      const res = await request(app)
        .get(`/api/v1/courses/${draft.courseId}`)
        .set("Authorization", authHeader(user.userId));
      expect(res.status).toBe(200);
    }
  });

  it("hides review feedback from learners", async () => {
    const { user: owner } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const course = await createTestCourse({ instructorId: owner.userId, status: "approved" });
    await db.orm.public.Courses.where({ courseId: course.courseId }).update({
      reviewFeedback: "Great course",
    });

    const res = await request(app)
      .get(`/api/v1/courses/${course.courseId}`)
      .set("Authorization", authHeader(learner.userId));

    expect(res.body.course.reviewFeedback).toBeNull();
  });

  it("keeps the instructor and admin lists to their roles", async () => {
    const { user: learner } = await createTestUser();

    const instructorList = await request(app)
      .get("/api/v1/instructor/courses")
      .set("Authorization", authHeader(learner.userId));
    const adminList = await request(app)
      .get("/api/v1/admin/courses")
      .set("Authorization", authHeader(learner.userId));

    expect(instructorList.status).toBe(403);
    expect(adminList.status).toBe(403);
  });
});

describe("GET /api/v1/courses (catalog)", () => {
  it("lists approved courses only, filtered by level, with isEnrolled for learners", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const beginner = await createTestCourse({
      instructorId: instructor.userId,
      status: "approved",
      targetLevel: "beginner",
    });
    const advanced = await createTestCourse({
      instructorId: instructor.userId,
      status: "approved",
      targetLevel: "advanced",
    });
    await createTestCourse({ instructorId: instructor.userId, status: "pending_review" });
    await enrollTestUser(learner.userId, advanced.courseId);
    const asLearner = authHeader(learner.userId);

    const all = await request(app).get("/api/v1/courses").set("Authorization", asLearner);
    expect(all.status).toBe(200);
    expect(all.body.courses.map((c: { courseId: number }) => c.courseId)).toEqual([
      beginner.courseId,
      advanced.courseId,
    ]);
    expect(all.body.courses[0].isEnrolled).toBe(false);
    expect(all.body.courses[1].isEnrolled).toBe(true);

    const filtered = await request(app)
      .get("/api/v1/courses?level=advanced")
      .set("Authorization", asLearner);
    expect(filtered.body.courses).toHaveLength(1);
    expect(filtered.body.courses[0].courseId).toBe(advanced.courseId);

    const badLevel = await request(app)
      .get("/api/v1/courses?level=expert")
      .set("Authorization", asLearner);
    expect(badLevel.status).toBe(400);
  });

  it("counts only core lessons in lessonCount", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    await createTestLesson({ courseId: course.courseId, kind: "core" });
    await createTestLesson({ courseId: course.courseId, kind: "remedial" });

    const res = await request(app)
      .get("/api/v1/courses")
      .set("Authorization", authHeader(instructor.userId));

    expect(res.body.courses[0].lessonCount).toBe(1);
  });
});

describe("DELETE /api/v1/courses/:courseId", () => {
  it("deletes a draft nobody has enrolled in", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const course = await createTestCourse({ instructorId: instructor.userId });
    await createTestLesson({ courseId: course.courseId });

    const res = await request(app)
      .delete(`/api/v1/courses/${course.courseId}`)
      .set("Authorization", authHeader(instructor.userId));

    expect(res.status).toBe(200);
    expect(await db.orm.public.Courses.first({ courseId: course.courseId })).toBeNull();
  });

  it("refuses a draft with enrolled learners, and any course that isn't a draft", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const withdrawn = await createTestCourse({ instructorId: instructor.userId });
    await enrollTestUser(learner.userId, withdrawn.courseId);
    const approved = await createTestCourse({
      instructorId: instructor.userId,
      status: "approved",
    });

    for (const course of [withdrawn, approved]) {
      const res = await request(app)
        .delete(`/api/v1/courses/${course.courseId}`)
        .set("Authorization", authHeader(instructor.userId));
      expect(res.status).toBe(409);
    }
  });
});

describe("POST /api/v1/courses/:courseId/archive", () => {
  it("lets the owner and admins archive, and archiving twice is harmless", async () => {
    const { user: owner } = await createTestUser({ role: "instructor" });
    const { user: admin } = await createTestUser({ role: "admin" });
    const first = await createTestCourse({ instructorId: owner.userId, status: "approved" });
    const second = await createTestCourse({ instructorId: owner.userId, status: "pending_review" });

    const byOwner = await request(app)
      .post(`/api/v1/courses/${first.courseId}/archive`)
      .set("Authorization", authHeader(owner.userId));
    expect(byOwner.status).toBe(200);
    expect(byOwner.body.course.status).toBe("archived");

    const again = await request(app)
      .post(`/api/v1/courses/${first.courseId}/archive`)
      .set("Authorization", authHeader(owner.userId));
    expect(again.status).toBe(200);

    const byAdmin = await request(app)
      .post(`/api/v1/courses/${second.courseId}/archive`)
      .set("Authorization", authHeader(admin.userId));
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.course.status).toBe("archived");
  });
});

describe("POST /api/v1/courses/:courseId/enroll", () => {
  it("enrols with 201, then returns the same enrolment with 200", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    await createTestLesson({ courseId: course.courseId });
    const asLearner = authHeader(learner.userId);

    const first = await request(app)
      .post(`/api/v1/courses/${course.courseId}/enroll`)
      .set("Authorization", asLearner);
    expect(first.status).toBe(201);
    expect(first.body.enrollment).toMatchObject({
      course: { courseId: course.courseId, isEnrolled: true },
      completedAt: null,
      completedLessons: 0,
      totalCoreLessons: 1,
      progressPercent: 0,
    });

    const second = await request(app)
      .post(`/api/v1/courses/${course.courseId}/enroll`)
      .set("Authorization", asLearner);
    expect(second.status).toBe(200);
    expect(second.body.enrollment.enrolledAt).toBe(first.body.enrollment.enrolledAt);
  });

  it("returns 404 for a course that isn't approved, and 403 for non-learners", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const draft = await createTestCourse({ instructorId: instructor.userId });

    const notApproved = await request(app)
      .post(`/api/v1/courses/${draft.courseId}/enroll`)
      .set("Authorization", authHeader(learner.userId));
    expect(notApproved.status).toBe(404);

    const asInstructor = await request(app)
      .post(`/api/v1/courses/${draft.courseId}/enroll`)
      .set("Authorization", authHeader(instructor.userId));
    expect(asInstructor.status).toBe(403);
  });
});

describe("DELETE /api/v1/courses/:courseId/enroll", () => {
  it("leaves with 200, then returns 404 because the learner is no longer enrolled", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    await enrollTestUser(learner.userId, course.courseId);
    const asLearner = authHeader(learner.userId);

    const first = await request(app)
      .delete(`/api/v1/courses/${course.courseId}/enroll`)
      .set("Authorization", asLearner);
    expect(first.status).toBe(200);

    const second = await request(app)
      .delete(`/api/v1/courses/${course.courseId}/enroll`)
      .set("Authorization", asLearner);
    expect(second.status).toBe(404);
  });

  it("returns 403 for non-learners", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    const res = await request(app)
      .delete(`/api/v1/courses/${course.courseId}/enroll`)
      .set("Authorization", authHeader(instructor.userId));
    expect(res.status).toBe(403);
  });
});