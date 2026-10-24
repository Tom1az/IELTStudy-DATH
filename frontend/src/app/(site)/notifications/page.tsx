"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, BookOpen, CalendarClock, CheckCheck, MessageSquare, Trophy } from "lucide-react";
import { meApi } from "@/lib/api";
import type { AppNotification } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { RequireRole } from "@/lib/auth-context";
import { cx, timeAgo } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, PageLoader, Tabs } from "@/components/ui";

const ICON: Record<AppNotification["type"], JSX.Element> = {
  new_content: <BookOpen className="h-4 w-4" />,
  deadline: <CalendarClock className="h-4 w-4" />,
  result: <Trophy className="h-4 w-4" />,
  review: <MessageSquare className="h-4 w-4" />,
  system: <Bell className="h-4 w-4" />,
};
const TINT: Record<AppNotification["type"], string> = { new_content: "bg-skill-l-bg text-skill-l", deadline: "bg-skill-w-bg text-skill-w", result: "bg-skill-r-bg text-skill-r", review: "bg-skill-s-bg text-skill-s", system: "bg-sand text-ink" };

function NotificationsInner() {
  const router = useRouter();
  const { data, error, loading, reload, setData } = useAsync(() => meApi.notifications(), []);
  const [tab, setTab] = useState<"all" | "unread">("all");
  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const list = data.filter((n) => tab === "all" || !n.read);
  const unread = data.filter((n) => !n.read).length;

  const open = async (n: AppNotification) => {
    if (!n.read) { setData(data.map((x) => (x.id === n.id ? { ...x, read: true } : x))); meApi.markRead([n.id]).catch(() => {}); }
    if (n.link) router.push(n.link);
  };

  return (
    <div className="container max-w-3xl pb-16 pt-10 md:pt-12">
      <PageHeader eyebrow="Notifications" title="What's new" actions={unread > 0 ? <button className="btn-outline" onClick={async () => { await meApi.markRead("all"); reload(true); }}><CheckCheck className="h-4 w-4" /> Mark all as read</button> : undefined}>
        New content, deadlines, results and replies. Choose what you receive in <Link href="/profile" className="link">settings</Link>.
      </PageHeader>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "all", label: `All (${data.length})` }, { id: "unread", label: `Unread (${unread})` }]} />
      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
        {list.length === 0 ? <EmptyState icon={<Bell className="h-6 w-6" />} title={tab === "unread" ? "You're all caught up" : "No notifications yet"} /> : (
          <ul className="divide-y divide-line">
            {list.map((n) => (
              <li key={n.id}>
                <button onClick={() => open(n)} className={cx("flex w-full items-start gap-3 px-4 py-4 text-left hover:bg-cream", !n.read && "bg-[#FFFCF5]")}>
                  <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TINT[n.type])}>{ICON[n.type]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className={cx("text-[15px]", !n.read ? "font-semibold" : "font-medium")}>{n.title}</span>{!n.read && <span className="h-2 w-2 rounded-full bg-brand" aria-label="Unread" />}</span>
                    <span className="mt-0.5 block text-sm text-ink-muted">{n.body}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-ink-soft">{timeAgo(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  return <RequireRole><NotificationsInner /></RequireRole>;
}
