// Grades a learner's answer against a question's answer key. Used by POST /attempts/{id}/submit.
// The answer shapes follow the JSONB table in docs/ERD.md: a learner's answer is a string, or for
// `matching` an object of item id -> choice id. Joi (utils/validator.ts) has already checked that
// it is one of those two.
import { httpError } from "../utils/http-error.ts";
import { isPlainObject } from "./questions.ts";
import type { Json, QuestionType } from "./questions.ts";

// What a learner may send as an answer (the contract's Answer)
export type Answer = string | { [itemId: string]: string };

// A wrong shape (an object for a multiple-choice question, a string for a matching one) is a
// client bug, so it gets a 400 instead of being graded wrong
export const checkAnswerShape = (type: QuestionType, answer: Answer, questionId: number) => {
  const isText = typeof answer === "string";
  if (type === "matching" && isText) {
    throw httpError(
      400,
      `Question ${questionId} is a matching question: send { itemId: choiceId }`,
    );
  }
  if (type !== "matching" && !isText) {
    throw httpError(400, `Question ${questionId} needs a text answer`);
  }
};

// Gap-fill answers are compared ignoring case and extra spaces, so "  Colour " matches "colour"
const normaliseGapFill = (text: string) => {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
};

// gap_fill: the answer key is the list of accepted answers
const isGapFillCorrect = (answerKey: Json, answer: string) => {
  if (!Array.isArray(answerKey)) return false;

  const given = normaliseGapFill(answer);
  for (const accepted of answerKey) {
    if (typeof accepted === "string" && normaliseGapFill(accepted) === given) {
      return true;
    }
  }
  return false;
};

// matching: all or nothing. The answer must give the key's choice for every item, and nothing
// else, because a question scores 1 point or 0 (isCorrect is a boolean).
const isMatchingCorrect = (answerKey: Json, answer: { [itemId: string]: string }) => {
  if (!isPlainObject(answerKey)) return false;

  const keyItemIds = Object.keys(answerKey);
  if (Object.keys(answer).length !== keyItemIds.length) return false;

  for (const itemId of keyItemIds) {
    if (answer[itemId] !== answerKey[itemId]) return false;
  }
  return true;
};

// Call checkAnswerShape first; a wrong shape here is simply graded wrong
export const isAnswerCorrect = (type: QuestionType, answerKey: Json, answer: Answer) => {
  if (type === "matching") {
    return typeof answer === "object" && isMatchingCorrect(answerKey, answer);
  }
  if (typeof answer !== "string") return false;

  if (type === "gap_fill") {
    return isGapFillCorrect(answerKey, answer);
  }
  // multiple_choice, error_identification and true_false_not_given: the key is one exact id
  // ("B", or "true" / "false" / "not_given")
  return answer === answerKey;
};
