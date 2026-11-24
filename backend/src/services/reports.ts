// Reports of inappropriate content (contract: Reports). Any user reports a comment, a lesson or a
// question they can see; admins resolve or dismiss them. One report per user and target.
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { isUniqueViolation } from "../utils/db-errors.ts";
import { httpError } from "../utils/http-error.ts";
import type { PageQuery } from "../utils/pagination.ts";
import { pageMeta, pageWindow } from "../utils/pagination.ts";
import type { PublicUser } from "../utils/public-user.ts";
import { audit } from "./audit.ts";
import { removeComment } from "./comments.ts";
import { canSeeCourse, findVisibleLesson } from "./courses.ts";
import { notify } from "./notifications.ts";

const orm = db.orm.public;

export type ReportTargetType = "comment" | "lesson" | "question";
export type ReportStatus = "open" | "resolved" | "dismissed";

type ReportRow = {
  reportId: number;
  reporterId: number | null;
  targetType: ReportTargetType;
  targetId: number;
  reason: string;
  status: ReportStatus;
  note: string | null;
  handledById: number | null;
  handledAt: Temporal.Instant | null;
  createdAt: Temporal.Instant;
};

const preview = (text: string, max = 160) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// 404 unless the target exists and the reporter can see it
const assertReportable = async (user: PublicUser, targetType: ReportTargetType, targetId: number) => {
  if (targetType === "comment") {
    const comment = await orm.LessonComments.first({ commentId: targetId });
    if (!comment || comment.deletedAt !== null) throw httpError(404, "Comment not found");
    await findVisibleLesson(comment.lessonId, user);
    return;
  }
  if (targetType === "lesson") {
    await findVisibleLesson(targetId, user);
    return;
  }
  // A question is visible through a quiz the user can see (the diagnostic, or a lesson quiz)
  const question = await orm.Questions.first({ questionId: targetId });
  if (!question) throw httpError(404, "Question not found");
  if (user.role === "admin") return;
  const links = await orm.QuizQuestions.where({ questionId: targetId }).all();
  const quizzes =
    links.length > 0 ? await orm.Quizzes.where((q) => q.quizId.in(links.map((l) => l.quizId))).all() : [];
  if (quizzes.some((q) => q.kind === "diagnostic") || question.createdById === user.userId) return;
  for (const quiz of quizzes) {
    if (quiz.lessonId === null) continue;
    const lesson = await orm.Lessons.first({ lessonId: quiz.lessonId });
    const course = lesson ? await orm.Courses.first({ courseId: lesson.courseId }) : null;
    if (course && canSeeCourse(course, user)) return;
  }
  throw httpError(404, "Question not found");
};

// The report rows in the contract's shape, with what each one points at
const buildReports = async (rows: ReportRow[]) => {
  if (rows.length === 0) return [];
  const ids = (type: ReportTargetType) => rows.filter((r) => r.targetType === type).map((r) => r.targetId);
  const [comments, lessons, questions] = await Promise.all([
    ids("comment").length > 0 ? orm.LessonComments.where((c) => c.commentId.in(ids("comment"))).all() : [],
    ids("lesson").length > 0 ? orm.Lessons.where((l) => l.lessonId.in(ids("lesson"))).all() : [],
    ids("question").length > 0 ? orm.Questions.where((q) => q.questionId.in(ids("question"))).all() : [],
  ]);
  const commentLessonIds = comments.map((c) => c.lessonId);
  const moreLessons =
    commentLessonIds.length > 0 ? await orm.Lessons.where((l) => l.lessonId.in(commentLessonIds)).all() : [];
  const lessonById = new Map([...lessons, ...moreLessons].map((l) => [l.lessonId, l]));
  const commentById = new Map(comments.map((c) => [c.commentId, c]));
  const questionById = new Map(questions.map((q) => [q.questionId, q]));

  const userIds = [
    ...new Set(rows.flatMap((r) => [r.reporterId, r.handledById]).filter((id): id is number => id !== null)),
  ];
  const users = userIds.length > 0 ? await orm.Users.where((u) => u.userId.in(userIds)).all() : [];
  const userRef = (id: number | null) => {
    const user = id !== null ? users.find((u) => u.userId === id) : undefined;
    return user ? { userId: user.userId, fullName: user.fullName } : null;
  };

  return rows.map((row) => {
    let target: { preview: string | null; lessonId: number | null; courseId: number | null; removed: boolean };
    if (row.targetType === "comment") {
      const comment = commentById.get(row.targetId);
      const lesson = comment ? lessonById.get(comment.lessonId) : undefined;
      target = {
        preview: comment ? preview(comment.body) : null,
        lessonId: comment?.lessonId ?? null,
        courseId: lesson?.courseId ?? null,
        removed: !comment || comment.deletedAt !== null,
      };
    } else if (row.targetType === "lesson") {
      const lesson = lessonById.get(row.targetId);
      target = { preview: lesson?.title ?? null, lessonId: lesson?.lessonId ?? null, courseId: lesson?.courseId ?? null, removed: !lesson };
    } else {
      const question = questionById.get(row.targetId);
      target = { preview: question ? preview(question.questionText) : null, lessonId: null, courseId: null, removed: !question };
    }
    return {
      reportId: row.reportId,
      reporter: userRef(row.reporterId),
      targetType: row.targetType,
      targetId: row.targetId,
      target,
      reason: row.reason,
      status: row.status,
      note: row.note,
      handledBy: userRef(row.handledById),
      handledAt: row.handledAt,
      createdAt: row.createdAt,
    };
  });
};

export const createReport = async (
  user: PublicUser,
  input: { targetType: ReportTargetType; targetId: number; reason: string },
) => {
  await assertReportable(user, input.targetType, input.targetId);
  try {
    const row = await orm.ContentReports.create({
      reporterId: user.userId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      note: null,
      handledById: null,
      handledAt: null,
    });
    const [report] = await buildReports([row]);
    return report!;
  } catch (err) {
    if (isUniqueViolation(err)) throw httpError(409, "You have already reported this");
    throw err;
  }
};

export const listReports = async (
  filters: { status?: ReportStatus; targetType?: ReportTargetType } & PageQuery,
) => {
  const filtered = orm.ContentReports.where((r) =>
    and(
      filters.status ? r.status.eq(filters.status) : r.reportId.isNotNull(),
      filters.targetType ? r.targetType.eq(filters.targetType) : r.reportId.isNotNull(),
    ),
  );
  // The open queue is worked oldest first; handled reports read newest first
  const ordered =
    filters.status === "open"
      ? filtered.orderBy([(r) => r.createdAt.asc(), (r) => r.reportId.asc()])
      : filtered.orderBy([(r) => r.createdAt.desc(), (r) => r.reportId.desc()]);
  const { limit, offset } = pageWindow(filters);
  const [{ count }, rows] = await Promise.all([
    filtered.aggregate((agg) => ({ count: agg.count() })),
    ordered.limit(limit).offset(offset).all(),
  ]);
  return { reports: await buildReports(rows), ...pageMeta(count, filters) };
};

export const handleReport = async (
  admin: PublicUser,
  reportId: number,
  input: { status: "resolved" | "dismissed"; note?: string; removeComment?: boolean },
) => {
  const report = await orm.ContentReports.first({ reportId });
  if (!report) throw httpError(404, "Report not found");
  if (report.status !== "open") throw httpError(409, "This report has already been handled");
  if (input.removeComment && (report.targetType !== "comment" || input.status !== "resolved")) {
    throw httpError(400, "removeComment only applies when resolving a comment report");
  }

  await db.transaction(async (tx) => {
    const txOrm = tx.orm.public;
    // Only an open report changes, so two admins handling it at once can't both succeed
    const changed = await txOrm.ContentReports.where((r) =>
      and(r.reportId.eq(reportId), r.status.eq("open")),
    ).updateAndCount({
      status: input.status,
      note: input.note ?? null,
      handledById: admin.userId,
      handledAt: Temporal.Now.instant(),
    });
    if (changed === 0) throw httpError(409, "This report has already been handled");

    if (input.removeComment) {
      const comment = await txOrm.LessonComments.first({ commentId: report.targetId });
      if (comment && comment.deletedAt === null) {
        await removeComment(report.targetId, admin, { orm: txOrm, skipChecks: true });
      }
    }
    await audit(txOrm, admin.userId, {
      action: input.status === "resolved" ? "report.resolve" : "report.dismiss",
      targetType: "report",
      targetId: reportId,
      summary: `${input.status === "resolved" ? "Resolved" : "Dismissed"} a report on ${report.targetType} #${report.targetId}`,
      details: { targetType: report.targetType, targetId: report.targetId, note: input.note ?? null, removedComment: !!input.removeComment },
    });
    if (report.reporterId !== null) {
      await notify(txOrm, report.reporterId, {
        type: "report.handled",
        title: input.status === "resolved" ? "Thanks: your report was acted on" : "Your report was reviewed",
        body: input.note ?? null,
        link: null,
      });
    }
  });

  const [updated] = await buildReports([(await orm.ContentReports.first({ reportId }))!]);
  return updated!;
};
