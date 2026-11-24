import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../app.ts";
import { db } from "../prisma/db.ts";
import {
  authHeader,
  createTestCourse,
  createTestLesson,
  createTestQuestion,
  createTestQuiz,
  createTestUser,
  enrollTestUser,
  resetDb,
} from "../test/db.ts";

beforeEach(async () => {
  await resetDb();
});

const setUp = async () => {
  const { user: instructor } = await createTestUser({ role: "instructor" });
  const { user: admin } = await createTestUser({ role: "admin" });
  const { user: alice } = await createTestUser();
  const { user: bob } = await createTestUser();
  const { user: outsider } = await createTestUser();
  const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
  const lesson = await createTestLesson({ courseId: course.courseId });
  await enrollTestUser(alice.userId, course.courseId);
  await enrollTestUser(bob.userId, course.courseId);
  return { instructor, admin, alice, bob, outsider, course, lesson };
};

const post = (lessonId: number, userId: number, body: object) =>
  request(app).post(`/api/v1/lessons/${lessonId}/comments`).set("Authorization", authHeader(userId)).send(body);
const list = (lessonId: number, userId: number, query = "") =>
  request(app).get(`/api/v1/lessons/${lessonId}/comments${query}`).set("Authorization", authHeader(userId));

describe("lesson discussion", () => {
  it("posts comments and one level of replies, newest thread first, and notifies the parent's author", async () => {
    const { alice, bob, lesson } = await setUp();
    const first = await post(lesson.lessonId, alice.userId, { body: "Is the answer B?" });
    expect(first.status).toBe(201);
    const second = await post(lesson.lessonId, bob.userId, { body: "Great lesson" });
    const reply = await post(lesson.lessonId, bob.userId, { body: "Yes, B.", parentId: first.body.comment.commentId });
    expect(reply.status).toBe(201);

    const nested = await post(lesson.lessonId, alice.userId, { body: "x", parentId: reply.body.comment.commentId });
    expect(nested.status).toBe(400);

    const res = await list(lesson.lessonId, alice.userId);
    expect(res.status).toBe(200);
    expect(res.body.comments.map((c: { commentId: number }) => c.commentId)).toEqual([
      second.body.comment.commentId,
      first.body.comment.commentId,
    ]);
    expect(res.body.comments[1].replies).toHaveLength(1);
    expect(res.body.comments[1]).toMatchObject({ canEdit: true, canDelete: true, author: { userId: alice.userId } });
    expect(res.body.comments[1].replies[0]).toMatchObject({ canEdit: false, canDelete: false, body: "Yes, B." });
    expect(res.body).toMatchObject({ total: 2, page: 1 });

    const notes = await db.orm.public.Notifications.where({ userId: alice.userId }).all();
    expect(notes.map((n) => n.type)).toEqual(["comment.reply"]);
  });

  it("follows the lesson's access rule", async () => {
    const { outsider, lesson } = await setUp();
    expect((await list(lesson.lessonId, outsider.userId)).status).toBe(403);
    expect((await post(lesson.lessonId, outsider.userId, { body: "hi" })).status).toBe(403);
  });

  it("lets only the author edit; the author, the course owner and admins remove", async () => {
    const { alice, bob, instructor, lesson } = await setUp();
    const c = (await post(lesson.lessonId, alice.userId, { body: "Typo here" })).body.comment;

    const byBob = await request(app).patch(`/api/v1/comments/${c.commentId}`).set("Authorization", authHeader(bob.userId)).send({ body: "x" });
    expect(byBob.status).toBe(403);
    const edited = await request(app).patch(`/api/v1/comments/${c.commentId}`).set("Authorization", authHeader(alice.userId)).send({ body: "Fixed" });
    expect(edited.body.comment).toMatchObject({ body: "Fixed", edited: true });

    expect((await request(app).delete(`/api/v1/comments/${c.commentId}`).set("Authorization", authHeader(bob.userId))).status).toBe(403);
    expect((await request(app).delete(`/api/v1/comments/${c.commentId}`).set("Authorization", authHeader(instructor.userId))).status).toBe(200);
    // Gone, and it had no replies, so it leaves the list
    expect((await list(lesson.lessonId, alice.userId)).body.comments).toEqual([]);
    expect((await request(app).patch(`/api/v1/comments/${c.commentId}`).set("Authorization", authHeader(alice.userId)).send({ body: "x" })).status).toBe(404);
  });

  it("keeps a removed comment with replies as a placeholder, and audits an admin's removal", async () => {
    const { alice, bob, admin, lesson } = await setUp();
    const c = (await post(lesson.lessonId, alice.userId, { body: "Rude words" })).body.comment;
    await post(lesson.lessonId, bob.userId, { body: "Please be nice", parentId: c.commentId });

    await request(app).delete(`/api/v1/comments/${c.commentId}`).set("Authorization", authHeader(admin.userId));
    const res = await list(lesson.lessonId, bob.userId);
    expect(res.body.comments[0]).toMatchObject({ removed: true, removedByModerator: true, body: null, author: null });
    expect(res.body.comments[0].replies).toHaveLength(1);

    const replyToRemoved = await post(lesson.lessonId, bob.userId, { body: "x", parentId: c.commentId });
    expect(replyToRemoved.status).toBe(409);

    const audit = await db.orm.public.AdminAuditLogs.where({ actorId: admin.userId }).all();
    expect(audit.map((a) => a.action)).toEqual(["comment.remove"]);
  });

  it("pages the top-level comments", async () => {
    const { alice, lesson } = await setUp();
    for (let i = 0; i < 3; i++) await post(lesson.lessonId, alice.userId, { body: `c${i}` });
    const page2 = await list(lesson.lessonId, alice.userId, "?page=2&pageSize=2");
    expect(page2.body.comments.map((c: { body: string }) => c.body)).toEqual(["c0"]);
    expect(page2.body).toMatchObject({ total: 3, totalPages: 2 });
  });
});

describe("content reports", () => {
  it("reports a comment once, the admin resolves it and removes the comment, and the reporter is told", async () => {
    const { alice, bob, admin, lesson } = await setUp();
    const c = (await post(lesson.lessonId, alice.userId, { body: "Spam link" })).body.comment;

    const report = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", authHeader(bob.userId))
      .send({ targetType: "comment", targetId: c.commentId, reason: "It is spam" });
    expect(report.status).toBe(201);
    expect(report.body.report).toMatchObject({ status: "open", target: { preview: "Spam link", lessonId: lesson.lessonId } });

    const twice = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", authHeader(bob.userId))
      .send({ targetType: "comment", targetId: c.commentId, reason: "Again" });
    expect(twice.status).toBe(409);

    const queue = await request(app).get("/api/v1/admin/reports?status=open").set("Authorization", authHeader(admin.userId));
    expect(queue.body.reports).toHaveLength(1);
    expect(queue.body).toMatchObject({ total: 1 });

    const handled = await request(app)
      .patch(`/api/v1/admin/reports/${report.body.report.reportId}`)
      .set("Authorization", authHeader(admin.userId))
      .send({ status: "resolved", note: "Removed, thanks", removeComment: true });
    expect(handled.status).toBe(200);
    expect(handled.body.report).toMatchObject({ status: "resolved", handledBy: { userId: admin.userId }, target: { removed: true } });

    const again = await request(app)
      .patch(`/api/v1/admin/reports/${report.body.report.reportId}`)
      .set("Authorization", authHeader(admin.userId))
      .send({ status: "dismissed" });
    expect(again.status).toBe(409);

    const notes = await db.orm.public.Notifications.where({ userId: bob.userId, type: "report.handled" as never }).all();
    expect(notes).toHaveLength(1);
    const audit = await db.orm.public.AdminAuditLogs.where({ actorId: admin.userId }).all();
    expect(audit.map((a) => a.action).sort()).toEqual(["comment.remove", "report.resolve"]);
  });

  it("reports a lesson and a diagnostic question; 404 for things the reporter can't see", async () => {
    const { instructor, outsider } = await setUp();
    const draft = await createTestCourse({ instructorId: instructor.userId });
    const hidden = await createTestLesson({ courseId: draft.courseId });
    const approved = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    const visible = await createTestLesson({ courseId: approved.courseId });
    const question = await createTestQuestion({ createdById: instructor.userId });
    await createTestQuiz({ createdById: instructor.userId, kind: "diagnostic", questionIds: [question.questionId] });
    const header = authHeader(outsider.userId);
    const send = (targetType: string, targetId: number) =>
      request(app).post("/api/v1/reports").set("Authorization", header).send({ targetType, targetId, reason: "Wrong answer key" });

    expect((await send("lesson", visible.lessonId)).status).toBe(201);
    expect((await send("question", question.questionId)).status).toBe(201);
    expect((await send("lesson", hidden.lessonId)).status).toBe(404);
    expect((await send("comment", 9999)).status).toBe(404);
  });

  it("refuses removeComment on a dismissal or on a non-comment report", async () => {
    const { alice, admin, lesson } = await setUp();
    const report = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", authHeader(alice.userId))
      .send({ targetType: "lesson", targetId: lesson.lessonId, reason: "Outdated" });
    const res = await request(app)
      .patch(`/api/v1/admin/reports/${report.body.report.reportId}`)
      .set("Authorization", authHeader(admin.userId))
      .send({ status: "resolved", removeComment: true });
    expect(res.status).toBe(400);
  });
});
