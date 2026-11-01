import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import app from "../app.ts";
import { db } from "../prisma/db.ts";
import { varchar } from "../utils/db-types.ts";
import {
  authHeader,
  createAnsweredQuiz,
  createTestCourse,
  createTestLesson,
  createTestQuestion,
  createTestQuiz,
  createTestSkill,
  createTestUser,
  resetDb,
} from "../test/db.ts";

beforeEach(async () => {
  await resetDb();
});

const createPassage = async (createdById: number, lessonId: number | null = null) => {
  return db.orm.public.PassagesMedia.create({
    lessonId,
    createdById,
    type: "reading_text",
    title: varchar<255>("The first coffee houses"),
    content: "Coffee was first cultivated in Yemen.",
    mediaPath: null,
    orderIndex: 0,
  });
};

// A valid multiple-choice question body, tagged with one skill
const mcBody = (skillId: number) => ({
  questionType: "multiple_choice",
  questionText: "If she ______ harder last year, she would have passed the exam.",
  options: [
    { id: "A", text: "studied" },
    { id: "B", text: "had studied" },
    { id: "C", text: "has studied" },
  ],
  answerKey: "B",
  explanation: "Third conditional uses the past perfect after 'if'.",
  skills: [{ skillId, weight: 1 }],
});

describe("POST /api/v1/questions", () => {
  it("creates a question with its Q-matrix row", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const skillA = await createTestSkill();
    const skillB = await createTestSkill();

    const res = await request(app)
      .post("/api/v1/questions")
      .set("Authorization", authHeader(instructor.userId))
      .send({
        ...mcBody(skillA.skillId),
        skills: [
          { skillId: skillA.skillId, weight: 0.7 },
          { skillId: skillB.skillId, weight: 0.3 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.question).toMatchObject({
      passageId: null,
      questionType: "multiple_choice",
      answerKey: "B",
      difficulty: 3,
      createdById: instructor.userId,
      skills: [
        { skillId: skillA.skillId, skillCode: skillA.skillCode, weight: 0.7 },
        { skillId: skillB.skillId, skillCode: skillB.skillCode, weight: 0.3 },
      ],
    });
  });

  it("creates each question type", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const skill = await createTestSkill();
    const skills = [{ skillId: skill.skillId, weight: 1 }];

    const bodies = [
      { questionType: "true_false_not_given", answerKey: "not_given" },
      { questionType: "gap_fill", answerKey: ["colour", "color"] },
      {
        questionType: "error_identification",
        options: [
          { id: "A", text: "Neither of the reports" },
          { id: "B", text: "were" },
        ],
        answerKey: "B",
      },
      {
        questionType: "matching",
        options: {
          items: [{ id: "B", text: "Paragraph B" }],
          choices: [
            { id: "i", text: "A compromise solution" },
            { id: "ii", text: "The case in favour" },
          ],
        },
        answerKey: { B: "ii" },
      },
    ];
    for (const body of bodies) {
      const res = await request(app)
        .post("/api/v1/questions")
        .set("Authorization", authHeader(instructor.userId))
        .send({ ...body, questionText: "Question text", skills });
      expect(res.status).toBe(201);
    }
  });

  it("rejects options and answers that don't fit the question type (400)", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const skill = await createTestSkill();
    const asInstructor = authHeader(instructor.userId);

    const notAnOption = await request(app)
      .post("/api/v1/questions")
      .set("Authorization", asInstructor)
      .send({ ...mcBody(skill.skillId), answerKey: "D" });
    expect(notAnOption.status).toBe(400);

    const tfngWithOptions = await request(app)
      .post("/api/v1/questions")
      .set("Authorization", asInstructor)
      .send({ ...mcBody(skill.skillId), questionType: "true_false_not_given", answerKey: "true" });
    expect(tfngWithOptions.status).toBe(400);

    const missingItem = await request(app)
      .post("/api/v1/questions")
      .set("Authorization", asInstructor)
      .send({
        questionType: "matching",
        questionText: "Match each paragraph to its heading.",
        options: {
          items: [
            { id: "B", text: "Paragraph B" },
            { id: "C", text: "Paragraph C" },
          ],
          choices: [{ id: "i", text: "A compromise solution" }],
        },
        answerKey: { B: "i" },
        skills: [{ skillId: skill.skillId, weight: 1 }],
      });
    expect(missingItem.status).toBe(400);
  });

  it("rejects weights that don't add up to 1, a repeated skill and an unknown skill (400)", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const skillA = await createTestSkill();
    const skillB = await createTestSkill();
    const asInstructor = authHeader(instructor.userId);

    const badSum = await request(app)
      .post("/api/v1/questions")
      .set("Authorization", asInstructor)
      .send({
        ...mcBody(skillA.skillId),
        skills: [
          { skillId: skillA.skillId, weight: 0.5 },
          { skillId: skillB.skillId, weight: 0.4 },
        ],
      });
    expect(badSum.status).toBe(400);
    expect(badSum.body.error.message).toMatch(/add up to 1/);

    const repeated = await request(app)
      .post("/api/v1/questions")
      .set("Authorization", asInstructor)
      .send({
        ...mcBody(skillA.skillId),
        skills: [
          { skillId: skillA.skillId, weight: 0.5 },
          { skillId: skillA.skillId, weight: 0.5 },
        ],
      });
    expect(repeated.status).toBe(400);

    const unknown = await request(app)
      .post("/api/v1/questions")
      .set("Authorization", asInstructor)
      .send(mcBody(9999));
    expect(unknown.status).toBe(400);

    const count = await db.orm.public.Questions.all();
    expect(count).toHaveLength(0);
  });

  it("attaches a question to my passage, but not to someone else's (403) or a missing one (404)", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: other } = await createTestUser({ role: "instructor" });
    const skill = await createTestSkill();
    const myPassage = await createPassage(instructor.userId);
    const otherPassage = await createPassage(other.userId);
    const asInstructor = authHeader(instructor.userId);

    const mine = await request(app)
      .post("/api/v1/questions")
      .set("Authorization", asInstructor)
      .send({ ...mcBody(skill.skillId), passageId: myPassage.passageId });
    expect(mine.status).toBe(201);
    expect(mine.body.question.passageId).toBe(myPassage.passageId);

    const notMine = await request(app)
      .post("/api/v1/questions")
      .set("Authorization", asInstructor)
      .send({ ...mcBody(skill.skillId), passageId: otherPassage.passageId });
    expect(notMine.status).toBe(403);

    const missing = await request(app)
      .post("/api/v1/questions")
      .set("Authorization", asInstructor)
      .send({ ...mcBody(skill.skillId), passageId: 9999 });
    expect(missing.status).toBe(404);
  });

  it("returns 403 to learners", async () => {
    const { user: learner } = await createTestUser();
    const skill = await createTestSkill();

    const res = await request(app)
      .post("/api/v1/questions")
      .set("Authorization", authHeader(learner.userId))
      .send(mcBody(skill.skillId));

    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/questions", () => {
  it("shows instructors their own questions and admins all of them", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: other } = await createTestUser({ role: "instructor" });
    const { user: admin } = await createTestUser({ role: "admin" });
    const mine = await createTestQuestion({ createdById: instructor.userId });
    await createTestQuestion({ createdById: other.userId });

    const asInstructor = await request(app)
      .get("/api/v1/questions")
      .set("Authorization", authHeader(instructor.userId));
    expect(asInstructor.status).toBe(200);
    expect(asInstructor.body.questions.map((q: { questionId: number }) => q.questionId)).toEqual([
      mine.questionId,
    ]);

    const asAdmin = await request(app)
      .get("/api/v1/questions")
      .set("Authorization", authHeader(admin.userId));
    expect(asAdmin.body.questions).toHaveLength(2);
  });

  it("filters by skill, passage and type", async () => {
    const { user: admin } = await createTestUser({ role: "admin" });
    const skill = await createTestSkill();
    const passage = await createPassage(admin.userId);
    const tagged = await createTestQuestion({
      createdById: admin.userId,
      skillIds: [skill.skillId],
    });
    const onPassage = await createTestQuestion({
      createdById: admin.userId,
      passageId: passage.passageId,
    });
    const asAdmin = authHeader(admin.userId);

    const bySkill = await request(app)
      .get(`/api/v1/questions?skillId=${skill.skillId}`)
      .set("Authorization", asAdmin);
    expect(bySkill.body.questions.map((q: { questionId: number }) => q.questionId)).toEqual([
      tagged.questionId,
    ]);

    const byPassage = await request(app)
      .get(`/api/v1/questions?passageId=${passage.passageId}`)
      .set("Authorization", asAdmin);
    expect(byPassage.body.questions.map((q: { questionId: number }) => q.questionId)).toEqual([
      onPassage.questionId,
    ]);

    const byType = await request(app)
      .get("/api/v1/questions?type=gap_fill")
      .set("Authorization", asAdmin);
    expect(byType.body.questions).toHaveLength(0);

    const badQuery = await request(app)
      .get("/api/v1/questions?type=essay")
      .set("Authorization", asAdmin);
    expect(badQuery.status).toBe(400);
  });
});

describe("GET /api/v1/questions/:questionId", () => {
  it("returns my question with its answer, and 403 for someone else's", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: other } = await createTestUser({ role: "instructor" });
    const question = await createTestQuestion({ createdById: instructor.userId });

    const mine = await request(app)
      .get(`/api/v1/questions/${question.questionId}`)
      .set("Authorization", authHeader(instructor.userId));
    expect(mine.status).toBe(200);
    expect(mine.body.question.answerKey).toBe("true");

    const notMine = await request(app)
      .get(`/api/v1/questions/${question.questionId}`)
      .set("Authorization", authHeader(other.userId));
    expect(notMine.status).toBe(403);

    const missing = await request(app)
      .get("/api/v1/questions/9999")
      .set("Authorization", authHeader(instructor.userId));
    expect(missing.status).toBe(404);
  });
});

describe("PATCH /api/v1/questions/:questionId", () => {
  it("replaces the whole skill list", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const skillA = await createTestSkill();
    const skillB = await createTestSkill();
    const question = await createTestQuestion({
      createdById: instructor.userId,
      skillIds: [skillA.skillId],
    });

    const res = await request(app)
      .patch(`/api/v1/questions/${question.questionId}`)
      .set("Authorization", authHeader(instructor.userId))
      .send({ skills: [{ skillId: skillB.skillId, weight: 1 }] });

    expect(res.status).toBe(200);
    expect(res.body.question.skills).toEqual([
      { skillId: skillB.skillId, skillCode: skillB.skillCode, name: skillB.name, weight: 1 },
    ]);
  });

  it("checks the shape on the updated question", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const question = await createTestQuestion({ createdById: instructor.userId });
    const asInstructor = authHeader(instructor.userId);

    // A true/false question can't become multiple choice without options and a new answer
    const typeOnly = await request(app)
      .patch(`/api/v1/questions/${question.questionId}`)
      .set("Authorization", asInstructor)
      .send({ questionType: "multiple_choice" });
    expect(typeOnly.status).toBe(400);

    const complete = await request(app)
      .patch(`/api/v1/questions/${question.questionId}`)
      .set("Authorization", asInstructor)
      .send({
        questionType: "multiple_choice",
        options: [
          { id: "A", text: "Yes" },
          { id: "B", text: "No" },
        ],
        answerKey: "A",
      });
    expect(complete.status).toBe(200);
    expect(complete.body.question.questionType).toBe("multiple_choice");
  });

  it("returns 409 once learners have answered the question", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const course = await createTestCourse({ instructorId: instructor.userId });
    const lesson = await createTestLesson({ courseId: course.courseId });
    const { question } = await createAnsweredQuiz({
      lessonId: lesson.lessonId,
      createdById: instructor.userId,
      learnerId: learner.userId,
    });

    const res = await request(app)
      .patch(`/api/v1/questions/${question.questionId}`)
      .set("Authorization", authHeader(instructor.userId))
      .send({ questionText: "Changed" });

    expect(res.status).toBe(409);
  });

  it("returns 409 while an approved course's quiz uses it, but not a draft course's", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const question = await createTestQuestion({ createdById: instructor.userId });
    const draft = await createTestCourse({ instructorId: instructor.userId });
    const draftLesson = await createTestLesson({ courseId: draft.courseId });
    await createTestQuiz({
      createdById: instructor.userId,
      lessonId: draftLesson.lessonId,
      questionIds: [question.questionId],
    });
    const asInstructor = authHeader(instructor.userId);

    const whileDraft = await request(app)
      .patch(`/api/v1/questions/${question.questionId}`)
      .set("Authorization", asInstructor)
      .send({ questionText: "Changed while draft" });
    expect(whileDraft.status).toBe(200);

    const approved = await createTestCourse({
      instructorId: instructor.userId,
      status: "approved",
    });
    const approvedLesson = await createTestLesson({ courseId: approved.courseId });
    await createTestQuiz({
      createdById: instructor.userId,
      lessonId: approvedLesson.lessonId,
      questionIds: [question.questionId],
    });

    const whileApproved = await request(app)
      .patch(`/api/v1/questions/${question.questionId}`)
      .set("Authorization", asInstructor)
      .send({ questionText: "Changed while approved" });
    expect(whileApproved.status).toBe(409);
  });
});

describe("DELETE /api/v1/questions/:questionId", () => {
  it("deletes the question and removes it from its quiz", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const course = await createTestCourse({ instructorId: instructor.userId });
    const lesson = await createTestLesson({ courseId: course.courseId });
    const question = await createTestQuestion({ createdById: instructor.userId });
    const quiz = await createTestQuiz({
      createdById: instructor.userId,
      lessonId: lesson.lessonId,
      questionIds: [question.questionId],
    });

    const res = await request(app)
      .delete(`/api/v1/questions/${question.questionId}`)
      .set("Authorization", authHeader(instructor.userId));

    expect(res.status).toBe(200);
    const links = await db.orm.public.QuizQuestions.where({ quizId: quiz.quizId }).all();
    expect(links).toHaveLength(0);
  });

  it("returns 409 once learners have answered it", async () => {
    const { user: instructor } = await createTestUser({ role: "instructor" });
    const { user: learner } = await createTestUser();
    const course = await createTestCourse({ instructorId: instructor.userId });
    const lesson = await createTestLesson({ courseId: course.courseId });
    const { question } = await createAnsweredQuiz({
      lessonId: lesson.lessonId,
      createdById: instructor.userId,
      learnerId: learner.userId,
    });

    const res = await request(app)
      .delete(`/api/v1/questions/${question.questionId}`)
      .set("Authorization", authHeader(instructor.userId));

    expect(res.status).toBe(409);
  });
});
