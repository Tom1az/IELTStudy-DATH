import type { Request, Response } from "express";
import type { Varchar } from "@prisma/orm-postgres/target/codec-types";
import { db } from "../prisma/db.ts";
import { buildPassage } from "../services/course-views.ts";
import { assertEditable, findVisibleLesson, isCourseOwner } from "../services/courses.ts";
import { varchar } from "../utils/db-types.ts";
import { httpError } from "../utils/http-error.ts";
import type { PublicUser } from "../utils/public-user.ts";

const orm = db.orm.public;

type MediaType = "reading_text" | "listening_audio" | "video";

// The same rule as the database CHECK passages_media_has_payload: reading text needs `content`,
// audio and video need `mediaPath`. Checked here so the client gets a 400 instead of a 500.
const assertHasPayload = (type: MediaType, content: string | null, mediaPath: string | null) => {
  if (type === "reading_text" && !content) {
    throw httpError(400, "A reading text needs content");
  }
  if (type !== "reading_text" && !mediaPath) {
    throw httpError(400, "Audio and video need a mediaPath");
  }
};

// Passages are edited by their creator or an admin (docs/ERD.md, "Content edit rights")
const findOwnPassage = async (passageId: number, user: PublicUser) => {
  const passage = await orm.PassagesMedia.first({ passageId });
  if (!passage) {
    throw httpError(404, "Passage not found");
  }
  if (user.role !== "admin" && passage.createdById !== user.userId) {
    throw httpError(403, "Only the passage's creator or an admin can do this");
  }
  return passage;
};

// Locked content: a passage inside a lesson changes only while the course is draft or rejected.
// Diagnostic passages (no lesson) belong to no course, so there is no status to check.
const assertLessonEditable = async (lessonId: number | null, user: PublicUser) => {
  if (lessonId === null) return;
  const { course } = await findVisibleLesson(lessonId, user);
  assertEditable(course);
};

const createPassage = async (req: Request, res: Response) => {
  const user = req.user!;
  const {
    lessonId,
    type,
    title,
    content,
    mediaPath,
    orderIndex,
  }: {
    lessonId?: number | null;
    type: MediaType;
    title?: string | null;
    content?: string | null;
    mediaPath?: string | null;
    orderIndex: number;
  } = req.value!.body;

  if (lessonId === undefined || lessonId === null) {
    // Only admins create passages outside a lesson (the diagnostic's passages)
    if (user.role !== "admin") {
      throw httpError(403, "Instructors must attach a passage to one of their lessons");
    }
  } else {
    const { course } = await findVisibleLesson(lessonId, user);
    if (user.role !== "admin" && !isCourseOwner(course, user)) {
      throw httpError(403, "You can only add passages to your own lessons");
    }
    assertEditable(course);
  }

  assertHasPayload(type, content ?? null, mediaPath ?? null);

  const passage = await orm.PassagesMedia.create({
    lessonId: lessonId ?? null,
    createdById: user.userId,
    type,
    title: title ? varchar<255>(title) : null,
    content: content ?? null,
    mediaPath: mediaPath ? varchar<1024>(mediaPath) : null,
    orderIndex,
  });

  return res.status(201).json({
    passage: await buildPassage(passage),
    message: "Passage created",
  });
};

const getPassage = async (req: Request, res: Response) => {
  const passage = await findOwnPassage(req.value!.params!.passageId, req.user!);

  return res.status(200).json({
    passage: await buildPassage(passage),
    message: "Passage",
  });
};

const updatePassage = async (req: Request, res: Response) => {
  const passage = await findOwnPassage(req.value!.params!.passageId, req.user!);
  await assertLessonEditable(passage.lessonId, req.user!);

  const {
    type,
    title,
    content,
    mediaPath,
    orderIndex,
  }: {
    type?: MediaType;
    title?: string | null;
    content?: string | null;
    mediaPath?: string | null;
    orderIndex?: number;
  } = req.value!.body;

  // Check the payload rule on the passage as it will be after the update
  assertHasPayload(
    type ?? passage.type,
    content !== undefined ? content : passage.content,
    mediaPath !== undefined ? mediaPath : passage.mediaPath,
  );

  const changes: {
    type?: MediaType;
    title?: Varchar<255> | null;
    content?: string | null;
    mediaPath?: Varchar<1024> | null;
    orderIndex?: number;
  } = {};
  if (type !== undefined) changes.type = type;
  if (title !== undefined) changes.title = title ? varchar<255>(title) : null;
  if (content !== undefined) changes.content = content;
  if (mediaPath !== undefined) changes.mediaPath = mediaPath ? varchar<1024>(mediaPath) : null;
  if (orderIndex !== undefined) changes.orderIndex = orderIndex;

  const updated = await orm.PassagesMedia.where({ passageId: passage.passageId }).update(changes);
  if (!updated) {
    throw httpError(404, "Passage not found");
  }

  return res.status(200).json({
    passage: await buildPassage(updated),
    message: "Passage updated",
  });
};

// Deleting a passage also deletes its questions, so it is refused once learners have answered them
const deletePassage = async (req: Request, res: Response) => {
  const passage = await findOwnPassage(req.value!.params!.passageId, req.user!);
  await assertLessonEditable(passage.lessonId, req.user!);

  const questions = await orm.Questions.where({ passageId: passage.passageId })
    .select("questionId")
    .all();
  if (questions.length > 0) {
    const response = await orm.QuestionResponses.where((r) =>
      r.questionId.in(questions.map((question) => question.questionId)),
    ).first();
    if (response) {
      throw httpError(409, "Learners have answered this passage's questions");
    }
  }

  await orm.PassagesMedia.where({ passageId: passage.passageId }).delete();

  return res.status(200).json({ message: "Passage deleted" });
};

export default {
  createPassage,
  getPassage,
  updatePassage,
  deletePassage,
};
