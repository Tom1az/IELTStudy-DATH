// Builds the contract's attempt shapes (Attempt, AttemptResult, AttemptSummary) from database
// rows, loading related rows for a whole list with one IN query per table, as
// services/course-views.ts does.
import { db } from "../prisma/db.ts";
import type { Json } from "./questions.ts";
import { buildQuizSummaries, loadQuestionSkillTags, loadQuizQuestions } from "./quiz-views.ts";
import type { QuizSummary } from "./quiz-views.ts";
import type { QuizRow } from "./quizzes.ts";

const orm = db.orm.public;

// A quiz_attempts row as the database returns it
export type AttemptRow = {
  attemptId: number;
  userId: number;
  quizId: number;
  startedAt: Temporal.Instant;
  completedAt: Temporal.Instant | null;
  totalScore: number | null;
  maxScore: number;
  masteryChanges: Json | null;
};

// The question_responses columns the review screen needs
type ResponseRow = {
  questionId: number;
  userAnswer: Json;
  isCorrect: boolean;
  attemptOrder: number;
  responseTimeSeconds: number | null;
};

// The contract's Attempt
export const toAttempt = (row: AttemptRow) => ({
  attemptId: row.attemptId,
  quizId: row.quizId,
  status: row.completedAt === null ? "in_progress" : "completed",
  startedAt: row.startedAt,
  completedAt: row.completedAt,
  totalScore: row.totalScore,
  maxScore: row.maxScore,
});

// Share of correct answers, 0 to 100 with one decimal (21 of 30 -> 70). Null until submitted.
const toScorePercent = (row: AttemptRow) => {
  if (row.totalScore === null || row.maxScore === 0) return null;
  return Math.round((row.totalScore / row.maxScore) * 1000) / 10;
};

// One ResponseResult per quiz question, in quiz order. A skipped question has no
// question_responses row, so it is listed with userAnswer null and counts as wrong.
const buildResponseResults = async (row: AttemptRow) => {
  const questions = await loadQuizQuestions(row.quizId);
  const tagsByQuestion = await loadQuestionSkillTags(
    questions.map((question) => question.questionId),
  );

  const responses = await orm.QuestionResponses.where({ attemptId: row.attemptId }).all();
  const responseByQuestion = new Map<number, ResponseRow>();
  for (const response of responses) {
    responseByQuestion.set(response.questionId, response);
  }

  const results = [];
  for (const question of questions) {
    const response = responseByQuestion.get(question.questionId);
    results.push({
      questionId: question.questionId,
      questionText: question.questionText,
      questionType: question.questionType,
      userAnswer: response ? response.userAnswer : null,
      isCorrect: response ? response.isCorrect : false,
      correctAnswer: question.answerKey,
      explanation: question.explanation,
      attemptOrder: response ? response.attemptOrder : null,
      responseTimeSeconds: response ? response.responseTimeSeconds : null,
      skills: tagsByQuestion.get(question.questionId) ?? [],
    });
  }
  return results;
};

// The contract's AttemptResult. Before the attempt is submitted it reveals no answers:
// `responses` is empty and `scorePercent` is null.
export const buildAttemptResult = async (row: AttemptRow) => {
  const quiz = await orm.Quizzes.first({ quizId: row.quizId });
  // quiz_id is a required foreign key, so the quiz always exists
  const [summary] = await buildQuizSummaries(quiz ? [quiz] : []);

  const isCompleted = row.completedAt !== null;
  return {
    attempt: toAttempt(row),
    quiz: summary,
    scorePercent: toScorePercent(row),
    responses: isCompleted ? await buildResponseResults(row) : [],
    // Phase 3: BKT fills these in the submit transaction. Until then they are empty, as the
    // contract says.
    masteryChanges: [],
    recommendations: [],
  };
};

// The contract's AttemptSummary list: each Attempt with its QuizSummary
export const buildAttemptSummaries = async (rows: AttemptRow[]) => {
  if (rows.length === 0) return [];

  const quizIds: number[] = [];
  for (const row of rows) {
    if (!quizIds.includes(row.quizId)) quizIds.push(row.quizId);
  }
  const quizzes: QuizRow[] = await orm.Quizzes.where((q) => q.quizId.in(quizIds)).all();
  const summaries = await buildQuizSummaries(quizzes);
  const summaryById = new Map<number, QuizSummary>();
  for (const summary of summaries) {
    summaryById.set(summary.quizId, summary);
  }

  const result = [];
  for (const row of rows) {
    result.push({ ...toAttempt(row), quiz: summaryById.get(row.quizId) });
  }
  return result;
};
