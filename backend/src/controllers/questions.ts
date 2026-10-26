import type { Request, Response } from "express";
import { db } from "../prisma/db.ts";
import {
  assertCanUsePassage,
  assertQuestionEditable,
  assertWeightsSumToOne,
  checkQuestionShape,
  findOwnQuestion,
  replaceQuestionSkills,
} from "../services/questions.ts";
import type { Json, QuestionType } from "../services/questions.ts";
import { buildQuestion, buildQuestions } from "../services/quiz-views.ts";
import { assertSkillsExist } from "../services/skills.ts";
import type { SkillWeight } from "../services/skills.ts";
import { httpError } from "../utils/http-error.ts";

const orm = db.orm.public;

// Instructors see their own questions, admins see all. The filters are optional.
const listQuestions = async (req: Request, res: Response) => {
  const user = req.user!;
  const {
    skillId,
    passageId,
    type,
  }: { skillId?: number; passageId?: number; type?: QuestionType } = req.value!.query;

  const filters: { createdById?: number; passageId?: number; questionType?: QuestionType } = {};
  if (user.role !== "admin") filters.createdById = user.userId;
  if (passageId !== undefined) filters.passageId = passageId;
  if (type !== undefined) filters.questionType = type;

  let rows = await orm.Questions.where(filters)
    .orderBy((q) => q.questionId.asc())
    .all();

  // Keep only the questions tagged with this skill
  if (skillId !== undefined) {
    const tagged = await orm.QuestionSkills.where({ skillId }).select("questionId").all();
    const taggedIds = new Set(tagged.map((row) => row.questionId));
    rows = rows.filter((row) => taggedIds.has(row.questionId));
  }

  return res.status(200).json({
    questions: await buildQuestions(rows),
    message: "Questions",
  });
};

const createQuestion = async (req: Request, res: Response) => {
  const user = req.user!;
  const {
    passageId,
    questionType,
    questionText,
    options,
    answerKey,
    explanation,
    difficulty,
    skills,
  }: {
    passageId?: number | null;
    questionType: QuestionType;
    questionText: string;
    options?: Json;
    answerKey: Json;
    explanation?: string | null;
    difficulty: number;
    skills: SkillWeight[];
  } = req.value!.body;

  if (passageId !== undefined && passageId !== null) {
    await assertCanUsePassage(passageId, user);
  }
  checkQuestionShape(questionType, options ?? null, answerKey);
  assertWeightsSumToOne(skills);
  await assertSkillsExist(skills);

  // The question and its Q-matrix row are saved together or not at all
  const question = await db.transaction(async (tx) => {
    const row = await tx.orm.public.Questions.create({
      passageId: passageId ?? null,
      createdById: user.userId,
      questionType,
      questionText,
      options: options ?? null,
      answerKey,
      explanation: explanation || null,
      difficulty,
    });
    await replaceQuestionSkills(tx.orm.public, row.questionId, skills);
    return row;
  });

  return res.status(201).json({
    question: await buildQuestion(question),
    message: "Question created",
  });
};

const getQuestion = async (req: Request, res: Response) => {
  const question = await findOwnQuestion(req.value!.params!.questionId, req.user!);

  return res.status(200).json({
    question: await buildQuestion(question),
    message: "Question",
  });
};

const updateQuestion = async (req: Request, res: Response) => {
  const user = req.user!;
  const question = await findOwnQuestion(req.value!.params!.questionId, user);
  await assertQuestionEditable(question.questionId);

  const {
    passageId,
    questionType,
    questionText,
    options,
    answerKey,
    explanation,
    difficulty,
    skills,
  }: {
    passageId?: number | null;
    questionType?: QuestionType;
    questionText?: string;
    options?: Json;
    answerKey?: Json;
    explanation?: string | null;
    difficulty?: number;
    skills?: SkillWeight[];
  } = req.value!.body;

  if (passageId !== undefined && passageId !== null) {
    await assertCanUsePassage(passageId, user);
  }

  // Check the shape on the question as it will be after the update: a new questionType may
  // need new options and a new answerKey
  checkQuestionShape(
    questionType ?? question.questionType,
    options !== undefined ? options : question.options,
    answerKey !== undefined ? answerKey : question.answerKey,
  );

  if (skills !== undefined) {
    assertWeightsSumToOne(skills);
    await assertSkillsExist(skills);
  }

  const changes: {
    passageId?: number | null;
    questionType?: QuestionType;
    questionText?: string;
    options?: Json;
    answerKey?: Json;
    explanation?: string | null;
    difficulty?: number;
  } = {};
  if (passageId !== undefined) changes.passageId = passageId;
  if (questionType !== undefined) changes.questionType = questionType;
  if (questionText !== undefined) changes.questionText = questionText;
  if (options !== undefined) changes.options = options;
  if (answerKey !== undefined) changes.answerKey = answerKey;
  if (explanation !== undefined) changes.explanation = explanation || null;
  if (difficulty !== undefined) changes.difficulty = difficulty;

  const updated = await db.transaction(async (tx) => {
    let row = question;
    if (Object.keys(changes).length > 0) {
      const result = await tx.orm.public.Questions.where({
        questionId: question.questionId,
      }).update(changes);
      if (!result) throw httpError(404, "Question not found");
      row = result;
    }
    if (skills !== undefined) {
      await replaceQuestionSkills(tx.orm.public, question.questionId, skills);
    }
    return row;
  });

  return res.status(200).json({
    question: await buildQuestion(updated),
    message: "Question updated",
  });
};

// Deleting a question also removes it from quizzes and from the Q-matrix (database cascade)
const deleteQuestion = async (req: Request, res: Response) => {
  const question = await findOwnQuestion(req.value!.params!.questionId, req.user!);
  await assertQuestionEditable(question.questionId);

  await orm.Questions.where({ questionId: question.questionId }).delete();

  return res.status(200).json({ message: "Question deleted" });
};

export default {
  listQuestions,
  createQuestion,
  getQuestion,
  updateQuestion,
  deleteQuestion,
};
