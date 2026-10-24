// Rules for the question bank, shared by the question and quiz controllers. They come from the
// API contract and docs/ERD.md ("JSONB shapes", "Rules the app must enforce").
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { httpError } from "../utils/http-error.ts";
import type { PublicUser } from "../utils/public-user.ts";
import { EDITABLE_STATUSES } from "./courses.ts";
import type { SkillWeight } from "./skills.ts";

const orm = db.orm.public;

// The model collections we write to. Inside a transaction we use tx.orm.public, which has the same type.
type Orm = typeof db.orm.public;

export type QuestionType =
  "multiple_choice" | "true_false_not_given" | "gap_fill" | "matching" | "error_identification";

// Any value that can be stored in a JSONB column (options, answerKey). `readonly` matches what
// the ORM returns; we never change these values in place.
export type Json =
  string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };

type ChoiceOption = { id: string; text: string };

// ----- Shape of options and answerKey -----
// Joi (utils/validator.ts) has already checked the general types: options is a list of
// { id, text }, a { items, choices } object or null, and answerKey is a string, a list of
// strings or an object of strings. The functions below check that they fit the question type
// (the JSONB table in docs/ERD.md) and that the answer key points at options that exist, so
// attempts can be graded.

const isChoiceList = (options: Json): options is ChoiceOption[] => {
  return Array.isArray(options);
};

const isPlainObject = (value: Json): value is { [key: string]: Json } => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const hasDuplicateIds = (list: ChoiceOption[]) => {
  const seen = new Set<string>();
  for (const option of list) {
    if (seen.has(option.id)) return true;
    seen.add(option.id);
  }
  return false;
};

// multiple_choice and error_identification: options [{ id, text }, ...], answerKey "B"
const checkChoiceQuestion = (options: Json, answerKey: Json) => {
  if (!isChoiceList(options) || options.length < 2) {
    throw httpError(400, "This question type needs a list of at least 2 options");
  }
  if (hasDuplicateIds(options)) {
    throw httpError(400, "Option ids must be different from each other");
  }
  const optionIds = options.map((option) => option.id);
  if (typeof answerKey !== "string" || !optionIds.includes(answerKey)) {
    throw httpError(400, "answerKey must be the id of one of the options");
  }
};

// true_false_not_given: no options, answerKey "true" | "false" | "not_given"
const checkTrueFalseQuestion = (options: Json, answerKey: Json) => {
  if (options !== null) {
    throw httpError(400, "A true/false/not given question has no options");
  }
  if (answerKey !== "true" && answerKey !== "false" && answerKey !== "not_given") {
    throw httpError(400, 'answerKey must be "true", "false" or "not_given"');
  }
};

// gap_fill: no options, answerKey is the list of accepted answers
const checkGapFillQuestion = (options: Json, answerKey: Json) => {
  if (options !== null) {
    throw httpError(400, "A gap-fill question has no options");
  }
  if (!Array.isArray(answerKey)) {
    throw httpError(400, "answerKey must be the list of accepted answers");
  }
};

// matching: options { items, choices }, answerKey maps every item id to a choice id,
// e.g. { "B": "ii", "C": "iii" }
const checkMatchingQuestion = (options: Json, answerKey: Json) => {
  if (options === null || !isPlainObject(options)) {
    throw httpError(400, "A matching question needs options { items, choices }");
  }
  // Joi has checked that a plain-object `options` is { items, choices }, both lists of { id, text }
  const items = options.items as ChoiceOption[];
  const choices = options.choices as ChoiceOption[];
  if (hasDuplicateIds(items) || hasDuplicateIds(choices)) {
    throw httpError(400, "Item ids and choice ids must be different from each other");
  }
  if (!isPlainObject(answerKey)) {
    throw httpError(400, "answerKey must map each item id to a choice id");
  }

  const itemIds = items.map((item) => item.id);
  const choiceIds = choices.map((choice) => choice.id);
  for (const itemId of itemIds) {
    if (answerKey[itemId] === undefined) {
      throw httpError(400, `answerKey has no choice for item ${itemId}`);
    }
  }
  for (const [itemId, choiceId] of Object.entries(answerKey)) {
    if (!itemIds.includes(itemId)) {
      throw httpError(400, `answerKey uses an unknown item id: ${itemId}`);
    }
    if (typeof choiceId !== "string" || !choiceIds.includes(choiceId)) {
      throw httpError(400, `answerKey maps item ${itemId} to an unknown choice`);
    }
  }
};

export const checkQuestionShape = (type: QuestionType, options: Json, answerKey: Json) => {
  if (type === "multiple_choice" || type === "error_identification") {
    checkChoiceQuestion(options, answerKey);
  } else if (type === "true_false_not_given") {
    checkTrueFalseQuestion(options, answerKey);
  } else if (type === "gap_fill") {
    checkGapFillQuestion(options, answerKey);
  } else {
    checkMatchingQuestion(options, answerKey);
  }
};

// ----- Q-matrix weights -----

// The same tolerance as the seed (src/prisma/seed.ts). Sums of decimals aren't exact in
// floating point: 0.7 + 0.2 + 0.1 is 0.9999999999999999, which must still count as 1.
const WEIGHT_TOLERANCE = 1e-9;

// A question's skills are its row of the Q-matrix. The BKT update splits the evidence from one
// answer across these skills by weight, so the weights must add up to 1 (docs/ERD.md).
export const assertWeightsSumToOne = (skills: SkillWeight[]) => {
  let sum = 0;
  for (const skill of skills) {
    sum += skill.weight;
  }
  if (Math.abs(sum - 1) > WEIGHT_TOLERANCE) {
    throw httpError(400, `Skill weights must add up to 1 (they add up to ${sum})`);
  }
};

// Replaces a question's whole Q-matrix row
export const replaceQuestionSkills = async (tx: Orm, questionId: number, skills: SkillWeight[]) => {
  await tx.QuestionSkills.where({ questionId }).deleteAll();
  for (const skill of skills) {
    await tx.QuestionSkills.create({ questionId, skillId: skill.skillId, weight: skill.weight });
  }
};

// ----- Access -----

// Questions are read and edited by their creator or an admin (docs/ERD.md, "Content edit rights")
export const findOwnQuestion = async (questionId: number, user: PublicUser) => {
  const question = await orm.Questions.first({ questionId });
  if (!question) {
    throw httpError(404, "Question not found");
  }
  if (user.role !== "admin" && question.createdById !== user.userId) {
    throw httpError(403, "Only the question's creator or an admin can do this");
  }
  return question;
};

// A question can hang off a passage the caller created (any passage, for admins)
export const assertCanUsePassage = async (passageId: number, user: PublicUser) => {
  const passage = await orm.PassagesMedia.first({ passageId });
  if (!passage) {
    throw httpError(404, "Passage not found");
  }
  if (user.role !== "admin" && passage.createdById !== user.userId) {
    throw httpError(403, "You can only attach questions to your own passages");
  }
};

// Locked content (docs/ERD.md): a question can't change or be deleted
// 1. once learners have answered it, so past grades and the BKT response logs stay consistent;
// 2. while a quiz in a course that isn't draft or rejected uses it. The diagnostic belongs to
//    no course, so only rule 1 locks its questions.
export const assertQuestionEditable = async (questionId: number) => {
  const response = await orm.QuestionResponses.where({ questionId }).first();
  if (response) {
    throw httpError(409, "Learners have answered this question");
  }

  // Follow question -> quizzes -> lessons -> courses, one query per step
  const links = await orm.QuizQuestions.where({ questionId }).select("quizId").all();
  if (links.length === 0) return;

  const quizzes = await orm.Quizzes.where((q) =>
    and(q.quizId.in(links.map((link) => link.quizId)), q.lessonId.isNotNull()),
  )
    .select("lessonId")
    .all();
  const lessonIds: number[] = [];
  for (const quiz of quizzes) {
    if (quiz.lessonId !== null) lessonIds.push(quiz.lessonId);
  }
  if (lessonIds.length === 0) return;

  const lessons = await orm.Lessons.where((l) => l.lessonId.in(lessonIds))
    .select("courseId")
    .all();
  const lockedCourse = await orm.Courses.where((c) =>
    and(c.courseId.in(lessons.map((lesson) => lesson.courseId)), c.status.notIn(EDITABLE_STATUSES)),
  ).first();
  if (lockedCourse) {
    throw httpError(409, "A quiz in a course that isn't draft or rejected uses this question");
  }
};
