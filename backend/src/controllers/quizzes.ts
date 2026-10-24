import type { Request, Response } from "express";
import type { Varchar } from "@prisma/orm-postgres/target/codec-types";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { assertEditable, findVisibleLesson, isCourseOwner } from "../services/courses.ts";
import { buildQuiz } from "../services/quiz-views.ts";
import {
  assertCanUseQuestions,
  assertQuizEditable,
  findOwnQuiz,
  findQuizForViewer,
  replaceQuizQuestions,
} from "../services/quizzes.ts";
import type { QuizKind } from "../services/quizzes.ts";
import { varchar } from "../utils/db-types.ts";
import { isUniqueViolation } from "../utils/db-errors.ts";
import { httpError } from "../utils/http-error.ts";

const orm = db.orm.public;

const createQuiz = async (req: Request, res: Response) => {
  const user = req.user!;
  const {
    kind,
    lessonId,
    title,
    description,
    timeLimitSeconds,
    questionIds,
  }: {
    kind: QuizKind;
    lessonId?: number | null;
    title: string;
    description?: string | null;
    timeLimitSeconds?: number | null;
    questionIds: number[];
  } = req.value!.body;

  if (kind === "diagnostic") {
    // One placement test for the whole platform, written by an admin. It belongs to no lesson.
    if (user.role !== "admin") {
      throw httpError(403, "Only admins can create the diagnostic");
    }
    if (lessonId !== undefined && lessonId !== null) {
      throw httpError(400, "The diagnostic can't belong to a lesson");
    }
    const existing = await orm.Quizzes.first({ kind: "diagnostic" });
    if (existing) {
      throw httpError(409, "The diagnostic already exists");
    }
  } else {
    // Lesson and practice quizzes sit in a lesson, so they follow its course's access rules
    if (lessonId === undefined || lessonId === null) {
      throw httpError(400, "Lesson and practice quizzes need a lessonId");
    }
    const { course } = await findVisibleLesson(lessonId, user);
    if (user.role !== "admin" && !isCourseOwner(course, user)) {
      throw httpError(403, "You can only add quizzes to your own lessons");
    }
    assertEditable(course);
  }

  await assertCanUseQuestions(questionIds, user);

  // The quiz and its question list are saved together or not at all
  let quiz;
  try {
    quiz = await db.transaction(async (tx) => {
      const row = await tx.orm.public.Quizzes.create({
        kind,
        lessonId: lessonId ?? null,
        createdById: user.userId,
        title: varchar<255>(title),
        description: description || null,
        timeLimitSeconds: timeLimitSeconds ?? null,
      });
      await replaceQuizQuestions(tx.orm.public, row.quizId, questionIds);
      return row;
    });
  } catch (err) {
    // Two admins created the diagnostic at the same moment: the partial unique index
    // quizzes_single_diagnostic let only one of them through
    if (isUniqueViolation(err)) {
      throw httpError(409, "The diagnostic already exists");
    }
    throw err;
  }

  return res.status(201).json({
    quiz: await buildQuiz(quiz, "author"),
    message: "Quiz created",
  });
};

// Authors get the questions with answers; everyone else gets the learner view
const getQuiz = async (req: Request, res: Response) => {
  const { quiz, view } = await findQuizForViewer(req.value!.params!.quizId, req.user!);

  return res.status(200).json({
    quiz: await buildQuiz(quiz, view),
    message: "Quiz",
  });
};

const updateQuiz = async (req: Request, res: Response) => {
  const user = req.user!;
  const { quiz, course } = await findOwnQuiz(req.value!.params!.quizId, user);
  await assertQuizEditable(quiz, course);

  const {
    title,
    description,
    timeLimitSeconds,
    questionIds,
  }: {
    title?: string;
    description?: string | null;
    timeLimitSeconds?: number | null;
    questionIds?: number[];
  } = req.value!.body;

  if (questionIds !== undefined) {
    await assertCanUseQuestions(questionIds, user);
  }

  const changes: {
    title?: Varchar<255>;
    description?: string | null;
    timeLimitSeconds?: number | null;
  } = {};
  if (title !== undefined) changes.title = varchar<255>(title);
  if (description !== undefined) changes.description = description || null;
  if (timeLimitSeconds !== undefined) changes.timeLimitSeconds = timeLimitSeconds;

  const updated = await db.transaction(async (tx) => {
    let row = quiz;
    if (Object.keys(changes).length > 0) {
      const result = await tx.orm.public.Quizzes.where({ quizId: quiz.quizId }).update(changes);
      if (!result) throw httpError(404, "Quiz not found");
      row = result;
    }
    if (questionIds !== undefined) {
      await replaceQuizQuestions(tx.orm.public, quiz.quizId, questionIds);
    }
    return row;
  });

  return res.status(200).json({
    quiz: await buildQuiz(updated, "author"),
    message: "Quiz updated",
  });
};

// Deleting a quiz also deletes its question list (database cascade), but not the questions
const deleteQuiz = async (req: Request, res: Response) => {
  const { quiz, course } = await findOwnQuiz(req.value!.params!.quizId, req.user!);
  await assertQuizEditable(quiz, course);

  await orm.Quizzes.where({ quizId: quiz.quizId }).delete();

  return res.status(200).json({ message: "Quiz deleted" });
};

// The placement test, learner view, plus my finished attempt if I have already taken it
const getDiagnostic = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const quiz = await orm.Quizzes.first({ kind: "diagnostic" });
  if (!quiz) {
    throw httpError(404, "The diagnostic hasn't been set up yet");
  }

  const completed = await orm.QuizAttempts.where((a) =>
    and(a.userId.eq(userId), a.quizId.eq(quiz.quizId), a.completedAt.isNotNull()),
  )
    .orderBy((a) => a.attemptId.asc())
    .first();

  return res.status(200).json({
    quiz: await buildQuiz(quiz, "learner"),
    completedAttemptId: completed ? completed.attemptId : null,
    message: "Diagnostic",
  });
};

export default {
  createQuiz,
  getQuiz,
  updateQuiz,
  deleteQuiz,
  getDiagnostic,
};
