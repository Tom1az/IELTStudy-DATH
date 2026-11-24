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
  createTestSkill,
  createTestUser,
  enrollTestUser,
  resetDb,
} from "../test/db.ts";

// A course with two core lessons (each with a quiz) and one remedial lesson with a quiz
const setUp = async () => {
  const { user: instructor } = await createTestUser({ role: "instructor" });
  const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
  const skill = await createTestSkill();
  const first = await createTestLesson({ courseId: course.courseId, orderIndex: 0, skillIds: [skill.skillId] });
  const second = await createTestLesson({ courseId: course.courseId, orderIndex: 1, skillIds: [skill.skillId] });
  const remedial = await createTestLesson({ courseId: course.courseId, kind: "remedial", skillIds: [skill.skillId] });
  const quizFor = async (lessonId: number) => {
    const question = await createTestQuestion({ createdById: instructor.userId, skillIds: [skill.skillId] });
    return createTestQuiz({ createdById: instructor.userId, lessonId, questionIds: [question.questionId] });
  };
  const secondQuiz = await quizFor(second.lessonId);
  const remedialQuiz = await quizFor(remedial.lessonId);
  const { user: learner } = await createTestUser();
  await enrollTestUser(learner.userId, course.courseId);
  return { instructor, course, skill, first, second, remedial, secondQuiz, remedialQuiz, learner };
};

beforeEach(async () => {
  await resetDb();
});

describe("lesson gating", () => {
  it("locks the second core lesson until the first is completed", async () => {
    const { course, first, second, remedial, learner } = await setUp();
    const asLearner = authHeader(learner.userId);

    const gates = await request(app).get(`/api/v1/courses/${course.courseId}/gates`).set("Authorization", asLearner);
    expect(gates.status).toBe(200);
    const byId = new Map(gates.body.gates.map((g: { lessonId: number; locked: boolean }) => [g.lessonId, g.locked]));
    expect(byId.get(first.lessonId)).toBe(false);
    expect(byId.get(second.lessonId)).toBe(true);
    expect(byId.get(remedial.lessonId)).toBe(false);

    const list = await request(app).get(`/api/v1/courses/${course.courseId}/lessons`).set("Authorization", asLearner);
    expect(list.body.lessons.find((l: { lessonId: number }) => l.lessonId === second.lessonId).locked).toBe(true);

    const locked = await request(app).get(`/api/v1/lessons/${second.lessonId}`).set("Authorization", asLearner);
    expect(locked.status).toBe(403);
    expect(locked.body.error.message).toMatch(/Complete/);

    await request(app)
      .put(`/api/v1/lessons/${first.lessonId}/progress`)
      .set("Authorization", asLearner)
      .send({ status: "completed" });
    const open = await request(app).get(`/api/v1/lessons/${second.lessonId}`).set("Authorization", asLearner);
    expect(open.status).toBe(200);
  });

  it("opens the next lesson when the previous lesson's skills are mastered", async () => {
    const { skill, second, learner } = await setUp();
    await db.orm.public.UserSkillMastery.create({
      userId: learner.userId,
      skillId: skill.skillId,
      masteryProb: 0.8,
      observations: 3,
    });
    const res = await request(app).get(`/api/v1/lessons/${second.lessonId}`).set("Authorization", authHeader(learner.userId));
    expect(res.status).toBe(200);
  });

  it("blocks a locked lesson's progress, quiz view and attempts, but not for staff", async () => {
    const { instructor, second, secondQuiz, learner } = await setUp();
    const asLearner = authHeader(learner.userId);

    const progress = await request(app)
      .put(`/api/v1/lessons/${second.lessonId}/progress`)
      .set("Authorization", asLearner)
      .send({ status: "completed" });
    const view = await request(app).get(`/api/v1/quizzes/${secondQuiz.quizId}`).set("Authorization", asLearner);
    const start = await request(app).post(`/api/v1/quizzes/${secondQuiz.quizId}/attempts`).set("Authorization", asLearner);
    expect([progress.status, view.status, start.status]).toEqual([403, 403, 403]);

    const asOwner = await request(app).get(`/api/v1/quizzes/${secondQuiz.quizId}`).set("Authorization", authHeader(instructor.userId));
    expect(asOwner.status).toBe(200);
  });

  it("lets any learner open a remedial lesson and its quiz without enrolling, but not a core lesson", async () => {
    const { first, remedial, remedialQuiz } = await setUp();
    const { user: stranger } = await createTestUser();
    const header = authHeader(stranger.userId);

    expect((await request(app).get(`/api/v1/lessons/${remedial.lessonId}`).set("Authorization", header)).status).toBe(200);
    expect((await request(app).post(`/api/v1/quizzes/${remedialQuiz.quizId}/attempts`).set("Authorization", header)).status).toBe(201);
    const core = await request(app).get(`/api/v1/lessons/${first.lessonId}`).set("Authorization", header);
    expect(core.status).toBe(403);
    expect(core.body.error.message).toMatch(/Enrol/);
  });

  it("answers 404 for the gates of a course the learner can't see", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const draft = await createTestCourse({ instructorId: instructor.userId });
    const res = await request(app).get(`/api/v1/courses/${draft.courseId}/gates`).set("Authorization", authHeader(learner.userId));
    expect(res.status).toBe(404);
  });
});
