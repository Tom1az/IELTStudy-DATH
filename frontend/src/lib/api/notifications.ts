import type { Paginated } from "@/lib/types";
import { backendRequest } from "./client";
import type { PageMeta } from "./client";

/** `Notification` in `backend/src/docs/openapi.yaml` (tag Notifications). */
interface BackendNotification {
  notificationId: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  at: string;
}

export interface NotificationPage extends Paginated<AppNotification> {
  unreadCount: number;
}

const toNotification = (n: BackendNotification): AppNotification => ({
  id: String(n.notificationId),
  type: n.type,
  title: n.title,
  body: n.body ?? "",
  link: n.link,
  read: n.readAt !== null,
  at: n.createdAt,
});

export const notificationsApi = {
  /** My notifications, newest first. `unreadCount` covers all of them, not just this page. */
  async list(params: { unread?: boolean; page?: number; pageSize?: number } = {}): Promise<NotificationPage> {
    const query = new URLSearchParams({ page: String(Math.max(1, params.page ?? 1)), pageSize: String(params.pageSize ?? 20) });
    if (params.unread) query.set("unread", "true");
    const res = await backendRequest<PageMeta & { notifications: BackendNotification[]; unreadCount: number }>("GET", `/me/notifications?${query}`);
    return { items: res.notifications.map(toNotification), page: res.page, pageSize: res.pageSize, total: res.total, totalPages: res.totalPages, unreadCount: res.unreadCount };
  },

  /** Just the number for the bell. */
  async unreadCount(): Promise<number> {
    const res = await backendRequest<{ unreadCount: number }>("GET", "/me/notifications?unread=true&pageSize=1");
    return res.unreadCount;
  },

  async markRead(id: string): Promise<void> {
    await backendRequest("PATCH", `/me/notifications/${id}/read`);
  },

  async markAllRead(): Promise<number> {
    const res = await backendRequest<{ updated: number }>("POST", "/me/notifications/read-all");
    return res.updated;
  },
};
