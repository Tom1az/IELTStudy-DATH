// In-app notifications (contract: Notifications). `notify` runs inside the caller's transaction,
// so a notification exists exactly when the change it announces was saved.
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { varchar } from "../utils/db-types.ts";
import { httpError } from "../utils/http-error.ts";
import { pageMeta, pageWindow } from "../utils/pagination.ts";
import type { PageQuery } from "../utils/pagination.ts";

type Orm = typeof db.orm.public;

export type NotificationType =
  | "course.approved"
  | "course.rejected"
  | "course.new_lessons"
  | "attempt.feedback"
  | "comment.reply"
  | "report.handled";

export type NotificationInput = {
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
};

type NotificationRow = {
  notificationId: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Temporal.Instant | null;
  createdAt: Temporal.Instant;
};

// Titles go into VARCHAR(255): a long course title must not make the whole change fail
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// `orm` is `tx.orm.public` inside a transaction (or `db.orm.public` outside one)
export const notify = async (orm: Orm, userId: number, input: NotificationInput) => {
  await orm.Notifications.create({
    userId,
    type: varchar<64>(input.type),
    title: varchar<255>(clip(input.title, 255)),
    body: input.body ?? null,
    link: input.link ? varchar<1024>(input.link) : null,
    readAt: null,
  });
};

// The same notification to several users, e.g. every learner enrolled in a course
export const notifyMany = async (orm: Orm, userIds: number[], input: NotificationInput) => {
  for (const userId of new Set(userIds)) {
    await notify(orm, userId, input);
  }
};

export const toNotification = (row: NotificationRow) => ({
  notificationId: row.notificationId,
  type: row.type,
  title: row.title,
  body: row.body,
  link: row.link,
  readAt: row.readAt,
  createdAt: row.createdAt,
});

export const listNotifications = async (
  userId: number,
  options: { unread?: boolean } & PageQuery,
) => {
  const orm = db.orm.public;
  const mine = options.unread
    ? orm.Notifications.where((n) => and(n.userId.eq(userId), n.readAt.isNull()))
    : orm.Notifications.where({ userId });
  const { limit, offset } = pageWindow(options);

  const [{ count: total }, { count: unreadCount }, rows] = await Promise.all([
    mine.aggregate((agg) => ({ count: agg.count() })),
    orm.Notifications.where((n) => and(n.userId.eq(userId), n.readAt.isNull())).aggregate(
      (agg) => ({ count: agg.count() }),
    ),
    mine
      .orderBy([(n) => n.createdAt.desc(), (n) => n.notificationId.desc()])
      .limit(limit)
      .offset(offset)
      .all(),
  ]);

  return { notifications: rows.map(toNotification), unreadCount, ...pageMeta(total, options) };
};

// Another user's notification is a 404, so ids don't reveal anything. Marking twice keeps the
// first readAt: the UPDATE only touches an unread row.
export const markRead = async (userId: number, notificationId: number) => {
  const orm = db.orm.public;
  const row = await orm.Notifications.first({ notificationId });
  if (!row || row.userId !== userId) {
    throw httpError(404, "Notification not found");
  }
  if (row.readAt !== null) return toNotification(row);

  await orm.Notifications.where((n) =>
    and(n.notificationId.eq(notificationId), n.readAt.isNull()),
  ).updateAndCount({ readAt: Temporal.Now.instant() });
  const updated = await orm.Notifications.first({ notificationId });
  return toNotification(updated!);
};

export const markAllRead = async (userId: number) => {
  return db.orm.public.Notifications.where((n) =>
    and(n.userId.eq(userId), n.readAt.isNull()),
  ).updateAndCount({ readAt: Temporal.Now.instant() });
};
