import { useSyncExternalStore } from "react";
import { createStore } from "./store";

/*
 * MOCK DATA. These stores stand in for the notifications (backlog #6), lesson comments (#5)
 * and content reports (#7) endpoints, which the backend does not have yet. Everything lives in
 * this browser tab and resets on reload. Notifications are not filtered by user here; the real
 * endpoint filters by user_id. When the contract is merged into backend/src/docs/openapi.yaml,
 * replace the bodies of these functions with backendRequest calls. The components keep their props.
 */

export type NotificationType = "course_review" | "new_lesson" | "comment_reply";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface LessonComment {
  id: string;
  lessonId: string;
  authorId: string;
  authorName: string;
  /** Null for a top-level comment. Replies are one level deep, so a reply's parent is always top-level. */
  parentId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  /** Soft delete: replies under a deleted comment stay visible. */
  deleted: boolean;
}

export type ReportTargetType = "comment" | "lesson" | "question";
export type ReportStatus = "open" | "resolved" | "dismissed";

export interface ContentReport {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: ReportTargetType;
  targetId: string;
  /** Stored with the report so the admin can read it even after the content changes. */
  targetLabel: string;
  reason: string;
  status: ReportStatus;
  createdAt: string;
  handledAt: string | null;
}

export const REPORT_REASONS = ["Spam or advertising", "Offensive or abusive", "Incorrect information", "Something else"] as const;

const now = () => new Date().toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
let seq = 1000;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

/* ───────── Notifications (#6) ───────── */

const notificationStore = createStore<AppNotification[]>(() => [
  { id: "n-1", type: "course_review", title: "Course approved", body: "Your course is now in the catalog.", link: "/instructor/courses", readAt: null, createdAt: hoursAgo(2) },
  { id: "n-2", type: "new_lesson", title: "New lesson", body: "A new lesson was added to a course you are enrolled in.", link: "/courses", readAt: null, createdAt: hoursAgo(26) },
  { id: "n-3", type: "comment_reply", title: "New reply", body: "Someone replied to your comment.", link: null, readAt: hoursAgo(48), createdAt: hoursAgo(50) },
]);

export function useNotifications() {
  const items = useSyncExternalStore(notificationStore.subscribe, notificationStore.get, notificationStore.get);
  return {
    items: [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    unread: items.filter((n) => !n.readAt).length,
    markRead: (id: string) =>
      notificationStore.set((list) => list.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now() } : n))),
    markAllRead: () =>
      notificationStore.set((list) => list.map((n) => (n.readAt ? n : { ...n, readAt: now() }))),
  };
}

/* ───────── Lesson comments (#5) ───────── */

const commentStore = createStore<LessonComment[]>(() => []);

export function useLessonComments(lessonId: string): LessonComment[] {
  const all = useSyncExternalStore(commentStore.subscribe, commentStore.get, commentStore.get);
  return all.filter((c) => c.lessonId === lessonId);
}

export function addComment(input: { lessonId: string; author: { id: string; name: string }; body: string; parentId?: string | null }): LessonComment {
  const comment: LessonComment = {
    id: nextId("c"),
    lessonId: input.lessonId,
    authorId: input.author.id,
    authorName: input.author.name,
    parentId: input.parentId ?? null,
    body: input.body.trim(),
    createdAt: now(),
    updatedAt: null,
    deleted: false,
  };
  commentStore.set((list) => [...list, comment]);
  return comment;
}

export function editComment(id: string, body: string) {
  commentStore.set((list) => list.map((c) => (c.id === id ? { ...c, body: body.trim(), updatedAt: now() } : c)));
}

export function deleteComment(id: string) {
  commentStore.set((list) => list.map((c) => (c.id === id ? { ...c, deleted: true, body: "" } : c)));
}

/* ───────── Content reports (#7) ───────── */

const reportStore = createStore<ContentReport[]>(() => [
  { id: "r-1", reporterId: "demo-learner", reporterName: "Demo learner", targetType: "comment", targetId: "c-demo", targetLabel: "Comment on Lesson 2: “Buy cheap certificates here”", reason: "Spam or advertising", status: "open", createdAt: hoursAgo(5), handledAt: null },
  { id: "r-2", reporterId: "demo-instructor", reporterName: "Demo instructor", targetType: "lesson", targetId: "l-demo", targetLabel: "Lesson: Matching headings (Reading)", reason: "Incorrect information", status: "open", createdAt: hoursAgo(30), handledAt: null },
]);

export function useReports(status: ReportStatus | "all"): ContentReport[] {
  const all = useSyncExternalStore(reportStore.subscribe, reportStore.get, reportStore.get);
  return all
    .filter((r) => status === "all" || r.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function hasReported(reporterId: string, targetType: ReportTargetType, targetId: string): boolean {
  return reportStore.get().some((r) => r.reporterId === reporterId && r.targetType === targetType && r.targetId === targetId);
}

/** One report per person per item, matching the unique key the backend will enforce. */
export function submitReport(input: {
  reporter: { id: string; name: string };
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  reason: string;
}): { ok: true } | { ok: false; error: string } {
  if (hasReported(input.reporter.id, input.targetType, input.targetId)) {
    return { ok: false, error: "You have already reported this." };
  }
  const report: ContentReport = {
    id: nextId("r"),
    reporterId: input.reporter.id,
    reporterName: input.reporter.name,
    targetType: input.targetType,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    reason: input.reason,
    status: "open",
    createdAt: now(),
    handledAt: null,
  };
  reportStore.set((list) => [...list, report]);
  return { ok: true };
}

export function setReportStatus(id: string, status: ReportStatus) {
  reportStore.set((list) => list.map((r) => (r.id === id ? { ...r, status, handledAt: status === "open" ? null : now() } : r)));
}

/** Hides the reported comment and closes the report. Lessons and questions can't be edited here yet. */
export function hideReportedContent(report: ContentReport) {
  if (report.targetType === "comment") deleteComment(report.targetId);
  setReportStatus(report.id, "resolved");
}
