// Builds the contract's question and quiz shapes (Question, QuestionForLearner, Quiz,
// QuizForLearner) from database rows, loading related rows for a whole list with one IN query
// per table, as services/course-views.ts does.
import { db } from "../prisma/db.ts";
import { buildPassages } from "./course-views.ts";
import type { Json, QuestionType } from "./questions.ts";
import type { QuizKind, QuizRow, QuizView } from "./quizzes.ts";

const orm = db.orm.public;

// A question row as the database returns it
export type QuestionRow = {
  questionId: number;
  passageId: number | null;
  createdById: number;
  questionType: QuestionType;
  questionText: string;
  options: Json;
  answerKey: Json;
  explanation: string | null;
  difficulty: number;
};

type SkillTag = { skillId: number; skillCode: string; name: string; weight: number };

// The Q-matrix row of each question: questionId -> [{ skillId, skillCode, name, weight }]
export const loadQuestionSkillTags = async (questionIds: number[]) => {
  const tagsByQuestion = new Map<number, SkillTag[]>();
  if (questionIds.length === 0) return tagsByQuestion;

  const rows = await orm.QuestionSkills.where((qs) => qs.questionId.in(questionIds))
    .include("skill", (skill) => skill.select("skillCode", "name"))
    .orderBy((qs) => qs.skillId.asc())
    .all();
  for (const row of rows) {
    // skill_id is a required foreign key, so the skill always exists; the ORM's type just
    // can't know that
    if (!row.skill) continue;

    const tags = tagsByQuestion.get(row.questionId) ?? [];
    tags.push({
      skillId: row.skillId,
      skillCode: row.skill.skillCode,
      name: row.skill.name,
      weight: row.weight,
    });
    tagsByQuestion.set(row.questionId, tags);
  }
  return tagsByQuestion;
};

// The contract's Question objects (author view, with the answer and skill weights)
export const buildQuestions = async (rows: QuestionRow[]) => {
  const tagsByQuestion = await loadQuestionSkillTags(rows.map((row) => row.questionId));

  const result = [];
  for (const row of rows) {
    result.push({
      questionId: row.questionId,
      passageId: row.passageId,
      questionType: row.questionType,
      questionText: row.questionText,
      options: row.options,
      answerKey: row.answerKey,
      explanation: row.explanation,
      difficulty: row.difficulty,
      skills: tagsByQuestion.get(row.questionId) ?? [],
      createdById: row.createdById,
    });
  }
  return result;
};

export const buildQuestion = async (row: QuestionRow) => {
  const [result] = await buildQuestions([row]);
  return result!;
};

// The contract's QuestionForLearner: no answer, explanation or skill weights
export const toQuestionForLearner = (row: QuestionRow) => ({
  questionId: row.questionId,
  passageId: row.passageId,
  questionType: row.questionType,
  questionText: row.questionText,
  options: row.options,
});

// The quiz's questions in quiz order
export const loadQuizQuestions = async (quizId: number) => {
  const links = await orm.QuizQuestions.where({ quizId })
    .orderBy((qq) => qq.orderIndex.asc())
    .all();
  if (links.length === 0) return [];

  const rows = await orm.Questions.where((q) =>
    q.questionId.in(links.map((link) => link.questionId)),
  ).all();
  const questionsById = new Map<number, QuestionRow>();
  for (const row of rows) {
    questionsById.set(row.questionId, row);
  }

  const ordered: QuestionRow[] = [];
  for (const link of links) {
    const question = questionsById.get(link.questionId);
    if (question) ordered.push(question);
  }
  return ordered;
};

// The passages the questions refer to, each listed once, in the order the questions first use them
const loadQuizPassages = async (questions: QuestionRow[]) => {
  const passageIds: number[] = [];
  for (const question of questions) {
    if (question.passageId !== null && !passageIds.includes(question.passageId)) {
      passageIds.push(question.passageId);
    }
  }
  if (passageIds.length === 0) return [];

  const rows = await orm.PassagesMedia.where((p) => p.passageId.in(passageIds)).all();
  const ordered = [];
  for (const passageId of passageIds) {
    const row = rows.find((passage) => passage.passageId === passageId);
    if (row) ordered.push(row);
  }
  return buildPassages(ordered);
};

// The contract's Quiz (author view) or QuizForLearner (learner view)
export const buildQuiz = async (quiz: QuizRow, view: QuizView) => {
  const questions = await loadQuizQuestions(quiz.quizId);
  const passages = await loadQuizPassages(questions);

  const summary = {
    quizId: quiz.quizId,
    kind: quiz.kind,
    title: quiz.title,
    questionCount: questions.length,
    timeLimitSeconds: quiz.timeLimitSeconds,
    lessonId: quiz.lessonId,
    description: quiz.description,
  };

  if (view === "author") {
    return {
      ...summary,
      createdById: quiz.createdById,
      passages,
      questions: await buildQuestions(questions),
    };
  }
  return {
    ...summary,
    passages,
    questions: questions.map(toQuestionForLearner),
  };
};

// The contract's QuizSummary
export type QuizSummary = {
  quizId: number;
  kind: QuizKind;
  title: string;
  questionCount: number;
  timeLimitSeconds: number | null;
};

// QuizSummary for a list of quizzes, with one query for all their question counts
export const buildQuizSummaries = async (quizzes: QuizRow[]) => {
  // Number of questions in each quiz: quizId -> count
  const questionCounts = new Map<number, number>();
  if (quizzes.length > 0) {
    const quizIds = quizzes.map((quiz) => quiz.quizId);
    const links = await orm.QuizQuestions.where((qq) => qq.quizId.in(quizIds))
      .select("quizId")
      .all();
    for (const link of links) {
      questionCounts.set(link.quizId, (questionCounts.get(link.quizId) ?? 0) + 1);
    }
  }

  const summaries: QuizSummary[] = [];
  for (const quiz of quizzes) {
    summaries.push({
      quizId: quiz.quizId,
      kind: quiz.kind,
      title: quiz.title,
      questionCount: questionCounts.get(quiz.quizId) ?? 0,
      timeLimitSeconds: quiz.timeLimitSeconds,
    });
  }
  return summaries;
};
