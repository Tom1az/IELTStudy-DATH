"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { RequireRole } from "@/lib/auth-context";
import { useNotifications, type AppNotification } from "@/lib/mock/social";
import { cx, timeAgo } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";

function NotificationRow({ n, onRead }: { n: AppNotification; onRead: () => void }) {
  const unread = !n.readAt;
  const content = (
    <>
      <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", unread ? "bg-brand" : "bg-transparent")} aria-label={unread ? "Unread" : undefined} />
      <div className="min-w-0 flex-1">
        <p className={cx("text-sm", unread ? "font-bold" : "font-semibold text-ink-muted")}>{n.title}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{n.body}</p>
        <p className="mt-1 text-xs text-ink-soft">{timeAgo(n.createdAt)}</p>
      </div>
    </>
  );
  return (
    <li className="flex items-center gap-3 px-5 py-4">
      {n.link ? (
        <Link href={n.link} onClick={onRead} className="flex min-w-0 flex-1 items-start gap-3 hover:opacity-80">{content}</Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-3">{content}</div>
      )}
      {unread && <button type="button" className="btn-ghost btn-sm shrink-0" onClick={onRead}>Mark read</button>}
    </li>
  );
}

function NotificationsInner() {
  const { items, unread, markRead, markAllRead } = useNotifications();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const rows = onlyUnread ? items.filter((n) => !n.readAt) : items;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-10 md:pt-12">
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        actions={
          <>
            <button type="button" className={cx("btn-outline btn-sm", onlyUnread && "border-brand text-brand")} aria-pressed={onlyUnread} onClick={() => setOnlyUnread((v) => !v)}>
              Unread only
            </button>
            <button type="button" className="btn-ghost btn-sm" disabled={unread === 0} onClick={markAllRead}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </>
        }
      >
        Course reviews, new lessons and replies to your comments.
      </PageHeader>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Bell className="h-8 w-8" />} title={onlyUnread ? "No unread notifications" : "No notifications yet"}>
            We will show course reviews, new lessons and replies here.
          </EmptyState>
        </div>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {rows.map((n) => (
            <NotificationRow key={n.id} n={n} onRead={() => markRead(n.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <RequireRole roles={["learner", "instructor", "admin"]}>
      <NotificationsInner />
    </RequireRole>
  );
}
