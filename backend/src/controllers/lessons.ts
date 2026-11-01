import type { Request, Response } from "express";
import type { Varchar } from "@prisma/orm-postgres/target/codec-types";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { fetchCourseGates } from "../services/advanced-client.ts";
import { buildLessonDetail, buildLessons, toProgress } from "../services/course-views.ts";
import {
  assertCanStudy,
  assertCourseOwner,
  assertEditable,
  findVisibleCourse,
  findVisibleLesson,
} from "../services/courses.ts";
import { assertSkillsExist } from "../services/skills.ts";
import type { SkillWeight } from "../services/skills.ts";
import { varchar } from "../utils/db-types.ts";
import { httpError } from "../utils/http-error.ts";

const orm = db.orm.public;

// The model collections we write to. Inside a transaction we use tx.orm.public, which has the same type.
type Orm = typeof db.orm.public;

type LessonKind = "core" | "remedial";

// Replaces a lesson's whole skill tag list
const replaceSkillTags = async (tx: Orm, lessonId: number, skills: SkillWeight[]) => {
  await tx.LessonSkills.where({ lessonId }).deleteAll();
  for (const skill of skills) {
    await tx.LessonSkills.create({ lessonId, skillId: skill.skillId, weight: skill.weight });
  }
};

// Core lessons first in orderIndex order, then remedial lessons in orderIndex order.
// The enum values are stored as text, and "core" sorts before "remedial" alphabetically.
const listLessons = async (req: Request, res: Response) => {
  const course = await findVisibleCourse(req.value!.params!.courseId, req.user!);

  const rows = await orm.Lessons.where({ courseId: course.courseId })
    .orderBy([(l) => l.kind.asc(), (l) => l.orderIndex.asc(), (l) => l.lessonId.asc()])
    .all();

  const lessons = await buildLessons(rows, req.user!);

  // Phase 3: the Advanced service decides which lessons a learner has unlocked yet. If it isn't
  // available, nothing is locked.
  if (req.user!.role === "learner") {
    const gates = await fetchCourseGates(course.courseId, req.headers.authorization);
    if (gates) {
      return res.status(200).json({
        lessons: lessons.map((lesson) =>
          gates.get(lesson.lessonId)?.locked ? { ...lesson, locked: true } : lesson,
        ),
        message: "Lessons",
      });
    }
  }

  return res.status(200).json({
    lessons,
    message: "Lessons",
  });
};

const createLesson = async (req: Request, res: Response) => {
  const course = await findVisibleCourse(req.value!.params!.courseId, req.user!);
  assertCourseOwner(course, req.user!);
  assertEditable(course);

  const {
    title,
    content,
    kind,
    orderIndex,
    skills,
  }: {
    title: string;
    content?: string | null;
    kind: LessonKind;
    orderIndex: number;
    skills: SkillWeight[];
  } = req.value!.body;

  await assertSkillsExist(skills);

  // The lesson and its skill tags are saved together or not at all
  const lesson = await db.transaction(async (tx) => {
    const row = await tx.orm.public.Lessons.create({
      courseId: course.courseId,
      title: varchar<255>(title),
      content: content ?? null,
      kind,
      orderIndex,
    });
    await replaceSkillTags(tx.orm.public, row.lessonId, skills);
    return row;
  });

  return res.status(201).json({
    lesson: await buildLessonDetail(lesson, req.user!),
    message: "Lesson created",
  });
};

const getLesson = async (req: Request, res: Response) => {
  const { lesson, course } = await findVisibleLesson(req.value!.params!.lessonId, req.user!);
  await assertCanStudy(course, req.user!);

  // A learner can't open a lesson they haven't unlocked yet (403, as the contract says)
  if (req.user!.role === "learner") {
    const gates = await fetchCourseGates(course.courseId, req.headers.authorization);
    const gate = gates?.get(lesson.lessonId);
    if (gate?.locked) {
      throw httpError(403, gate.reason ?? "This lesson is locked");
    }
  }

  return res.status(200).json({
    lesson: await buildLessonDetail(lesson, req.user!),
    message: "Lesson",
  });
};

const updateLesson = async (req: Request, res: Response) => {
  const { lesson, course } = await findVisibleLesson(req.value!.params!.lessonId, req.user!);
  assertCourseOwner(course, req.user!);
  assertEditable(course);

  const {
    title,
    content,
    kind,
    orderIndex,
    skills,
  }: {
    title?: string;
    content?: string | null;
    kind?: LessonKind;
    orderIndex?: number;
    skills?: SkillWeight[];
  } = req.value!.body;

  if (skills !== undefined) await assertSkillsExist(skills);

  const changes: {
    title?: Varchar<255>;
    content?: string | null;
    kind?: LessonKind;
    orderIndex?: number;
  } = {};
  if (title !== undefined) changes.title = varchar<255>(title);
  if (content !== undefined) changes.content = content;
  if (kind !== undefined) changes.kind = kind;
  if (orderIndex !== undefined) changes.orderIndex = orderIndex;

  const updated = await db.transaction(async (tx) => {
    let row = lesson;
    if (Object.keys(changes).length > 0) {
      const result = await tx.orm.public.Lessons.where({ lessonId: lesson.lessonId }).update(
        changes,
      );
      if (!result) throw httpError(404, "Lesson not found");
      row = result;
    }
    if (skills !== undefined) {
      await replaceSkillTags(tx.orm.public, lesson.lessonId, skills);
    }
    return row;
  });

  return res.status(200).json({
    lesson: await buildLessonDetail(updated, req.user!),
    message: "Lesson updated",
  });
};

// A lesson can't be deleted once learners have used it: deleting it would also delete their
// attempts at its quizzes or their answers to its passages' questions (the database refuses).
const deleteLesson = async (req: Request, res: Response) => {
  const { lesson, course } = await findVisibleLesson(req.value!.params!.lessonId, req.user!);
  assertCourseOwner(course, req.user!);
  assertEditable(course);

  const quizzes = await orm.Quizzes.where({ lessonId: lesson.lessonId }).select("quizId").all();
  if (quizzes.length > 0) {
    const attempt = await orm.QuizAttempts.where((a) =>
      a.quizId.in(quizzes.map((quiz) => quiz.quizId)),
    ).first();
    if (attempt) {
      throw httpError(409, "Learners have attempted this lesson's quizzes");
    }
  }

  const passages = await orm.PassagesMedia.where({ lessonId: lesson.lessonId })
    .select("passageId")
    .all();
  if (passages.length > 0) {
    const questions = await orm.Questions.where((q) =>
      q.passageId.in(passages.map((passage) => passage.passageId)),
    )
      .select("questionId")
      .all();
    if (questions.length > 0) {
      const response = await orm.QuestionResponses.where((r) =>
        r.questionId.in(questions.map((question) => question.questionId)),
      ).first();
      if (response) {
        throw httpError(409, "Learners have answered questions in this lesson");
      }
    }
  }

  await orm.Lessons.where({ lessonId: lesson.lessonId }).delete();

  return res.status(200).json({ message: "Lesson deleted" });
};

// Sets enrollments.completed_at when every core lesson of the course is completed, and clears
// it again if a core lesson goes back to in_progress
const updateEnrollmentCompletion = async (userId: number, courseId: number) => {
  const coreLessons = await orm.Lessons.where({ courseId, kind: "core" }).select("lessonId").all();
  if (coreLessons.length === 0) return;

  const completed = await orm.LessonProgress.where((p) =>
    and(
      p.userId.eq(userId),
      p.status.eq("completed"),
      p.lessonId.in(coreLessons.map((lesson) => lesson.lessonId)),
    ),
  )
    .select("lessonId")
    .all();
  const allCompleted = completed.length === coreLessons.length;

  const enrollment = await orm.Enrollments.first({ userId, courseId });
  if (!enrollment) return;

  if (allCompleted && enrollment.completedAt === null) {
    await orm.Enrollments.where({ userId, courseId }).update({
      completedAt: Temporal.Now.instant(),
    });
  }
  if (!allCompleted && enrollment.completedAt !== null) {
    await orm.Enrollments.where({ userId, courseId }).update({ completedAt: null });
  }
};

// Creates or updates my progress on a lesson. completedAt is set when the status becomes
// completed (keeping the first completion time) and cleared when it goes back to in_progress.
const setLessonProgress = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { lesson, course } = await findVisibleLesson(req.value!.params!.lessonId, req.user!);
  await assertCanStudy(course, req.user!);

  const { status }: { status: "in_progress" | "completed" } = req.value!.body;

  const existing = await orm.LessonProgress.first({ userId, lessonId: lesson.lessonId });

  let completedAt: Temporal.Instant | null = null;
  if (status === "completed") {
    completedAt = existing?.completedAt ?? Temporal.Now.instant();
  }

  let progress;
  if (existing) {
    progress = await orm.LessonProgress.where({ userId, lessonId: lesson.lessonId }).update({
      status,
      completedAt,
    });
  } else {
    progress = await orm.LessonProgress.create({
      userId,
      lessonId: lesson.lessonId,
      status,
      completedAt,
    });
  }

  if (lesson.kind === "core") {
    await updateEnrollmentCompletion(userId, course.courseId);
  }

  return res.status(200).json({
    progress: toProgress(progress!),
    message: "Progress saved",
  });
};

export default {
  listLessons,
  createLesson,
  getLesson,
  updateLesson,
  deleteLesson,
  setLessonProgress,
};
