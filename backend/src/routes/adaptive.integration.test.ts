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

const orm = db.orm.public;

beforeEach(async () => {
  await resetDb();
});

const setMastery = (userId: number, skillId: number, masteryProb: number) =>
  orm.UserSkillMastery.create({ userId, skillId, masteryProb, observations: 1 });

const startAndSubmit = async (quizId: number, learnerId: number, responses: Array<{ questionId: number; answer: string }>) => {
  const header = authHeader(learnerId);
  const started = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", header);
  const attemptId = started.body.attempt.attemptId as number;
  const submitted = await request(app)
    .post(`/api/v1/attempts/${attemptId}/submit`)
    .set("Authorization", header)
    .send({ responses });
  return { attemptId, submitted };
};

describe("BKT in the submit transaction", () => {
  it("seeds every skill from the diagnostic (cold start) and returns the changes", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const measured = await createTestSkill({ category: "reading" });
    const unmeasured = await createTestSkill({ category: "reading" });
    const question = await createTestQuestion({ createdById: instructor.userId, skillIds: [measured.skillId] });
    const diagnostic = await createTestQuiz({ createdById: instructor.userId, kind: "diagnostic", questionIds: [question.questionId] });

    const { submitted } = await startAndSubmit(diagnostic.quizId, learner.userId, [{ questionId: question.questionId, answer: "true" }]);
    expect(submitted.status).toBe(200);
    const changes = submitted.body.result.masteryChanges;
    expect(changes.map((c: { skillId: number }) => c.skillId)).toEqual([measured.skillId, unmeasured.skillId]);
    expect(changes[0].before).toBeNull();
    expect(changes[0].after).toBeGreaterThan(0.3);
    // The unmeasured skill starts at its category's average
    expect(changes[1].after).toBe(changes[0].after);

    const mastery = await request(app).get("/api/v1/me/mastery").set("Authorization", authHeader(learner.userId));
    expect(mastery.body.mastery).toHaveLength(2);
  });

  it("lowers mastery on a wrong answer, recommends a remedial lesson, and the review shows both", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const skill = await createTestSkill();
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    const core = await createTestLesson({ courseId: course.courseId, skillIds: [skill.skillId] });
    const remedial = await createTestLesson({ courseId: course.courseId, kind: "remedial", skillIds: [skill.skillId] });
    await enrollTestUser(learner.userId, course.courseId);
    const question = await createTestQuestion({ createdById: instructor.userId, skillIds: [skill.skillId] });
    const quiz = await createTestQuiz({ createdById: instructor.userId, lessonId: core.lessonId, questionIds: [question.questionId] });
    await setMastery(learner.userId, skill.skillId, 0.6);

    const { attemptId, submitted } = await startAndSubmit(quiz.quizId, learner.userId, [{ questionId: question.questionId, answer: "false" }]);
    const result = submitted.body.result;
    expect(result.masteryChanges).toHaveLength(1);
    expect(result.masteryChanges[0].before).toBe(0.6);
    expect(result.masteryChanges[0].after).toBeLessThan(0.6);
    expect(result.recommendations.length).toBeGreaterThan(0);
    // The remedial lesson ranks first (remedial bonus); the rationale names the skill
    expect(result.recommendations[0].lesson.lessonId).toBe(remedial.lessonId);
    expect(result.recommendations[0].rationale).toContain(skill.name);

    // Reading the attempt again shows what the submit stored, without recomputing
    const again = await request(app).get(`/api/v1/attempts/${attemptId}`).set("Authorization", authHeader(learner.userId));
    expect(again.body.result.masteryChanges).toEqual(result.masteryChanges);
    expect(again.body.result.recommendations.map((r: { recommendationId: number }) => r.recommendationId)).toEqual(
      result.recommendations.map((r: { recommendationId: number }) => r.recommendationId),
    );
    const row = await orm.UserSkillMastery.first({ userId: learner.userId, skillId: skill.skillId });
    expect(row!.observations).toBe(2);
  });

  it("changes nothing for an attempt submitted without answers", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const skill = await createTestSkill();
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    const lesson = await createTestLesson({ courseId: course.courseId, skillIds: [skill.skillId] });
    await enrollTestUser(learner.userId, course.courseId);
    const question = await createTestQuestion({ createdById: instructor.userId, skillIds: [skill.skillId] });
    const quiz = await createTestQuiz({ createdById: instructor.userId, lessonId: lesson.lessonId, questionIds: [question.questionId] });

    const { submitted } = await startAndSubmit(quiz.quizId, learner.userId, []);
    expect(submitted.body.result).toMatchObject({ masteryChanges: [], recommendations: [] });
    expect(await orm.UserSkillMastery.where({ userId: learner.userId }).all()).toHaveLength(0);
  });
});

describe("GET /api/v1/recommendations", () => {
  it("never suggests a locked lesson or a core lesson of a course I'm not enrolled in", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const strong = await createTestSkill();
    const weak = await createTestSkill();
    const enrolled = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    await createTestLesson({ courseId: enrolled.courseId, orderIndex: 0, skillIds: [strong.skillId] });
    const locked = await createTestLesson({ courseId: enrolled.courseId, orderIndex: 1, skillIds: [weak.skillId] });
    await enrollTestUser(learner.userId, enrolled.courseId);
    const other = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    const otherCore = await createTestLesson({ courseId: other.courseId, orderIndex: 0, skillIds: [weak.skillId] });
    const otherRemedial = await createTestLesson({ courseId: other.courseId, kind: "remedial", skillIds: [weak.skillId] });
    await setMastery(learner.userId, weak.skillId, 0.1);

    const res = await request(app).get("/api/v1/recommendations").set("Authorization", authHeader(learner.userId));
    const ids = res.body.recommendations.map((r: { lesson: { lessonId: number } }) => r.lesson.lessonId);
    expect(ids).toEqual([otherRemedial.lessonId]);
    expect(ids).not.toContain(locked.lessonId);
    expect(ids).not.toContain(otherCore.lessonId);
    expect(res.body.recommendations[0].lesson.isEnrolled).toBe(false);
  });

  it("drops a recommendation once its skill is mastered, and records clicks for my own only", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const { user: other } = await createTestUser();
    const skill = await createTestSkill();
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    await createTestLesson({ courseId: course.courseId, kind: "remedial", skillIds: [skill.skillId] });
    await setMastery(learner.userId, skill.skillId, 0.1);
    const header = authHeader(learner.userId);

    const first = await request(app).get("/api/v1/recommendations").set("Authorization", header);
    expect(first.body.recommendations).toHaveLength(1);
    const id = first.body.recommendations[0].recommendationId;

    expect((await request(app).post(`/api/v1/recommendations/${id}/click`).set("Authorization", authHeader(other.userId))).status).toBe(403);
    expect((await request(app).post(`/api/v1/recommendations/${id}/click`).set("Authorization", header)).status).toBe(200);
    expect((await orm.Recommendations.first({ recommendationId: id }))!.clickedAt).not.toBeNull();

    await orm.UserSkillMastery.where({ userId: learner.userId, skillId: skill.skillId }).update({ masteryProb: 0.9 });
    const after = await request(app).get("/api/v1/recommendations").set("Authorization", header);
    expect(after.body.recommendations).toEqual([]);
  });

  it("gives the progress summary with the next best step", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const skill = await createTestSkill();
    const course = await createTestCourse({ instructorId: instructor.userId, status: "approved" });
    await createTestLesson({ courseId: course.courseId, kind: "remedial", skillIds: [skill.skillId] });
    await setMastery(learner.userId, skill.skillId, 0.2);

    const res = await request(app).get("/api/v1/progress/me").set("Authorization", authHeader(learner.userId));
    expect(res.status).toBe(200);
    expect(res.body.progress).toMatchObject({ masteredSkillsCount: 0, totalSkillsCount: 1, averageMastery: 0.2 });
    expect(res.body.nextBestStep.recommendationId).toBe(res.body.recommendations[0].recommendationId);
  });

  it("is for learners only", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const res = await request(app).get("/api/v1/recommendations").set("Authorization", authHeader(admin.userId));
    expect(res.status).toBe(403);
  });
});
