// Lesson discussion (contract: Discussion). Whoever may open a lesson may read and write its
// comments. One level of replies. Removal is a soft delete (deleted_at, deleted_by_id), so a
// removed comment with replies stays as a placeholder.
import { and, or } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { httpError } from "../utils/http-error.ts";
import type { PageQuery } from "../utils/pagination.ts";
import { pageMeta, pageWindow } from "../utils/pagination.ts";
import type { PublicUser } from "../utils/public-user.ts";
import { audit } from "./audit.ts";
import type { CourseRow } from "./courses.ts";
import { findVisibleLesson } from "./courses.ts";
import { assertCanOpenLesson } from "./gating.ts";
import { notify } from "./notifications.ts";

const orm = db.orm.public;

type CommentRow = {
  commentId: number;
  lessonId: number;
  userId: number;
  parentId: number | null;
  body: string;
  createdAt: Temporal.Instant;
  updatedAt: Temporal.Instant;
  deletedAt: Temporal.Instant | null;
  deletedById: number | null;
};

// The lesson and course of a discussion the user may join (same rule as opening the lesson)
export const findDiscussionLesson = async (lessonId: number, user: PublicUser) => {
  const { lesson, course } = await findVisibleLesson(lessonId, user);
  await assertCanOpenLesson(lesson, course, user);
  return { lesson, course };
};

const canModerate = (course: CourseRow, user: PublicUser) =>
  user.role === "admin" || course.instructorId === user.userId;

type Author = { userId: number; fullName: string; role: "learner" | "instructor" | "admin" };

// The contract's Comment
type CommentView = {
  commentId: number;
  lessonId: number;
  parentId: number | null;
  author: Author | null;
  body: string | null;
  removed: boolean;
  removedByModerator: boolean;
  edited: boolean;
  createdAt: Temporal.Instant;
  updatedAt: Temporal.Instant;
  canEdit: boolean;
  canDelete: boolean;
  replies: CommentView[];
};

const toComment = (
  row: CommentRow,
  authors: Map<number, Author>,
  course: CourseRow,
  viewer: PublicUser,
  replies: CommentView[] = [],
): CommentView => {
  const removed = row.deletedAt !== null;
  const author = authors.get(row.userId);
  return {
    commentId: row.commentId,
    lessonId: row.lessonId,
    parentId: row.parentId,
    author: removed || !author ? null : author,
    body: removed ? null : row.body,
    removed,
    removedByModerator: removed && row.deletedById !== null && row.deletedById !== row.userId,
    edited: Temporal.Instant.compare(row.updatedAt, row.createdAt) > 0 && !removed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    canEdit: !removed && row.userId === viewer.userId,
    canDelete: !removed && (row.userId === viewer.userId || canModerate(course, viewer)),
    replies,
  };
};

const loadAuthors = async (rows: CommentRow[]) => {
  const ids = [...new Set(rows.map((r) => r.userId))];
  const users = ids.length > 0 ? await orm.Users.where((u) => u.userId.in(ids)).all() : [];
  return new Map(users.map((u) => [u.userId, { userId: u.userId, fullName: u.fullName, role: u.role }]));
};

// Top-level comments newest first, each with its live replies oldest first. A removed top-level
// comment is kept only while it has a live reply.
export const listComments = async (lessonId: number, viewer: PublicUser, paging: PageQuery) => {
  const { course } = await findDiscussionLesson(lessonId, viewer);
  const topLevel = orm.LessonComments.where((c) =>
    and(
      c.lessonId.eq(lessonId),
      c.parentId.isNull(),
      or(c.deletedAt.isNull(), c.replies.some((r) => r.deletedAt.isNull())),
    ),
  );
  const { limit, offset } = pageWindow(paging);
  const [{ count }, rows] = await Promise.all([
    topLevel.aggregate((agg) => ({ count: agg.count() })),
    topLevel
      .orderBy([(c) => c.createdAt.desc(), (c) => c.commentId.desc()])
      .limit(limit)
      .offset(offset)
      .all(),
  ]);

  const replies =
    rows.length > 0
      ? await orm.LessonComments.where((c) =>
          and(c.parentId.in(rows.map((r) => r.commentId)), c.deletedAt.isNull()),
        )
          .orderBy([(c) => c.createdAt.asc(), (c) => c.commentId.asc()])
          .all()
      : [];
  const authors = await loadAuthors([...rows, ...replies]);

  return {
    comments: rows.map((row) =>
      toComment(
        row,
        authors,
        course,
        viewer,
        replies.filter((r) => r.parentId === row.commentId).map((r) => toComment(r, authors, course, viewer)),
      ),
    ),
    ...pageMeta(count, paging),
  };
};

export const createComment = async (
  lessonId: number,
  viewer: PublicUser,
  input: { body: string; parentId?: number | null },
) => {
  const { lesson, course } = await findDiscussionLesson(lessonId, viewer);

  let parent: CommentRow | null = null;
  if (input.parentId !== undefined && input.parentId !== null) {
    parent = await orm.LessonComments.first({ commentId: input.parentId });
    if (!parent || parent.lessonId !== lessonId) {
      throw httpError(400, "parentId must be a comment on this lesson");
    }
    if (parent.parentId !== null) {
      throw httpError(400, "Replies can only be one level deep: reply to the top-level comment");
    }
    if (parent.deletedAt !== null) {
      throw httpError(409, "This comment was removed, so it can't be replied to");
    }
  }

  const row = await db.transaction(async (tx) => {
    const created = await tx.orm.public.LessonComments.create({
      lessonId,
      userId: viewer.userId,
      parentId: parent ? parent.commentId : null,
      body: input.body,
      deletedAt: null,
      deletedById: null,
    });
    if (parent && parent.userId !== viewer.userId) {
      await notify(tx.orm.public, parent.userId, {
        type: "comment.reply",
        title: `${viewer.fullName} replied to your comment on "${lesson.title}"`,
        body: input.body.length > 200 ? `${input.body.slice(0, 199)}…` : input.body,
        link: `/learn/${course.courseId}/${lesson.lessonId}#comment-${parent.commentId}`,
      });
    }
    return created;
  });

  return toComment(row, await loadAuthors([row]), course, viewer);
};

// A live comment and its lesson's course, or 404
const findLiveComment = async (commentId: number, viewer: PublicUser) => {
  const row = await orm.LessonComments.first({ commentId });
  if (!row || row.deletedAt !== null) {
    throw httpError(404, "Comment not found");
  }
  const { course } = await findVisibleLesson(row.lessonId, viewer);
  return { row, course };
};

export const updateComment = async (commentId: number, viewer: PublicUser, body: string) => {
  const { row, course } = await findLiveComment(commentId, viewer);
  if (row.userId !== viewer.userId) {
    throw httpError(403, "Only the comment's author can edit it");
  }
  const updated = await orm.LessonComments.where({ commentId }).update({ body });
  return toComment(updated!, await loadAuthors([updated!]), course, viewer);
};

// Soft delete by the author, the course's instructor or an admin. Another person's comment
// removed by an admin goes into the audit log.
export const removeComment = async (
  commentId: number,
  viewer: PublicUser,
  options: { orm?: typeof orm; skipChecks?: boolean } = {},
) => {
  const { row, course } = await findLiveComment(commentId, viewer);
  if (!options.skipChecks && row.userId !== viewer.userId && !canModerate(course, viewer)) {
    throw httpError(403, "Only the author, the course's instructor or an admin can remove this comment");
  }

  const apply = async (txOrm: typeof orm) => {
    await txOrm.LessonComments.where((c) =>
      and(c.commentId.eq(commentId), c.deletedAt.isNull()),
    ).updateAndCount({ deletedAt: Temporal.Now.instant(), deletedById: viewer.userId });
    if (viewer.role === "admin" && row.userId !== viewer.userId) {
      await audit(txOrm, viewer.userId, {
        action: "comment.remove",
        targetType: "comment",
        targetId: commentId,
        summary: `Removed a comment on lesson #${row.lessonId}`,
        details: { lessonId: row.lessonId, authorId: row.userId, body: row.body.slice(0, 300) },
      });
    }
  };
  if (options.orm) await apply(options.orm);
  else await db.transaction((tx) => apply(tx.orm.public));
};
