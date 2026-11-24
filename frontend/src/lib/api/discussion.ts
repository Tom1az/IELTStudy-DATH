import type { Paginated, Role } from "@/lib/types";
import { backendRequest } from "./client";
import type { PageMeta } from "./client";

/**
 * Lesson discussion and content reports. Contract: `backend/src/docs/openapi.yaml`, tags
 * Discussion and Reports.
 */

interface BackendComment {
  commentId: number;
  lessonId: number;
  parentId: number | null;
  author: { userId: number; fullName: string; role: Role } | null;
  body: string | null;
  removed: boolean;
  removedByModerator: boolean;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
  replies: BackendComment[];
}

export interface LessonComment {
  id: string;
  parentId: string | null;
  author: { id: string; name: string; role: Role } | null;
  body: string | null;
  removed: boolean;
  removedByModerator: boolean;
  edited: boolean;
  at: string;
  canEdit: boolean;
  canDelete: boolean;
  replies: LessonComment[];
}

const toComment = (c: BackendComment): LessonComment => ({
  id: String(c.commentId),
  parentId: c.parentId === null ? null : String(c.parentId),
  author: c.author ? { id: String(c.author.userId), name: c.author.fullName, role: c.author.role } : null,
  body: c.body,
  removed: c.removed,
  removedByModerator: c.removedByModerator,
  edited: c.edited,
  at: c.createdAt,
  canEdit: c.canEdit,
  canDelete: c.canDelete,
  replies: c.replies.map(toComment),
});

export type ReportTargetType = "comment" | "lesson" | "question";
export type ReportStatus = "open" | "resolved" | "dismissed";

interface BackendReport {
  reportId: number;
  reporter: { userId: number; fullName: string } | null;
  targetType: ReportTargetType;
  targetId: number;
  target: { preview: string | null; lessonId: number | null; courseId: number | null; removed: boolean };
  reason: string;
  status: ReportStatus;
  note: string | null;
  handledBy: { userId: number; fullName: string } | null;
  handledAt: string | null;
  createdAt: string;
}

export interface ContentReport {
  id: string;
  reporter: string | null;
  targetType: ReportTargetType;
  targetId: string;
  preview: string | null;
  /** Where to look at the reported content, if it still exists. */
  href: string | null;
  removed: boolean;
  reason: string;
  status: ReportStatus;
  note: string | null;
  handledBy: string | null;
  handledAt: string | null;
  at: string;
}

const toReport = (r: BackendReport): ContentReport => ({
  id: String(r.reportId),
  reporter: r.reporter?.fullName ?? null,
  targetType: r.targetType,
  targetId: String(r.targetId),
  preview: r.target.preview,
  href:
    r.target.courseId !== null && r.target.lessonId !== null
      ? `/learn/${r.target.courseId}/${r.target.lessonId}${r.targetType === "comment" ? `#comment-${r.targetId}` : ""}`
      : null,
  removed: r.target.removed,
  reason: r.reason,
  status: r.status,
  note: r.note,
  handledBy: r.handledBy?.fullName ?? null,
  handledAt: r.handledAt,
  at: r.createdAt,
});

export const discussionApi = {
  /** Top-level comments newest first, each with its replies. */
  async list(lessonId: string, page = 1, pageSize = 10): Promise<Paginated<LessonComment>> {
    const res = await backendRequest<PageMeta & { comments: BackendComment[] }>("GET", `/lessons/${lessonId}/comments?page=${page}&pageSize=${pageSize}`);
    return { items: res.comments.map(toComment), page: res.page, pageSize: res.pageSize, total: res.total, totalPages: res.totalPages };
  },

  async post(lessonId: string, body: string, parentId?: string): Promise<LessonComment> {
    const res = await backendRequest<{ comment: BackendComment }>("POST", `/lessons/${lessonId}/comments`, {
      body: body.trim(),
      ...(parentId ? { parentId: Number(parentId) } : {}),
    });
    return toComment(res.comment);
  },

  async edit(commentId: string, body: string): Promise<LessonComment> {
    const res = await backendRequest<{ comment: BackendComment }>("PATCH", `/comments/${commentId}`, { body: body.trim() });
    return toComment(res.comment);
  },

  async remove(commentId: string): Promise<void> {
    await backendRequest("DELETE", `/comments/${commentId}`);
  },
};

export const reportsApi = {
  /** 409 if I already reported this. */
  async create(targetType: ReportTargetType, targetId: string, reason: string): Promise<void> {
    await backendRequest("POST", "/reports", { targetType, targetId: Number(targetId), reason: reason.trim() });
  },

  /** The admin moderation queue. Open reports come oldest first. */
  async list(params: { status?: ReportStatus | "all"; targetType?: ReportTargetType | "all"; page?: number; pageSize?: number } = {}): Promise<Paginated<ContentReport>> {
    const query = new URLSearchParams({ page: String(Math.max(1, params.page ?? 1)), pageSize: String(params.pageSize ?? 15) });
    if (params.status && params.status !== "all") query.set("status", params.status);
    if (params.targetType && params.targetType !== "all") query.set("targetType", params.targetType);
    const res = await backendRequest<PageMeta & { reports: BackendReport[] }>("GET", `/admin/reports?${query}`);
    return { items: res.reports.map(toReport), page: res.page, pageSize: res.pageSize, total: res.total, totalPages: res.totalPages };
  },

  async handle(reportId: string, input: { status: "resolved" | "dismissed"; note?: string; removeComment?: boolean }): Promise<ContentReport> {
    const res = await backendRequest<{ report: BackendReport }>("PATCH", `/admin/reports/${reportId}`, {
      status: input.status,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      ...(input.removeComment ? { removeComment: true } : {}),
    });
    return toReport(res.report);
  },
};
