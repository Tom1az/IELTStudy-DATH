"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { notificationsApi } from "@/lib/api";
import type { AppNotification } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { RequireRole } from "@/lib/auth-context";
import { cx, timeAgo } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, PageLoader, Pagination, Spinner, Tabs, useToast } from "@/components/ui";
import { NOTIFICATIONS_CHANGED } from "@/components/NotificationBell";

type Filter = "all" | "unread";

function NotificationsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>(sp.get("filter") === "unread" ? "unread" : "all");
  const [page, setPage] = useState(Math.max(1, Number(sp.get("page") ?? 1) || 1));
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filter === "unread") params.set("filter", "unread");
    if (page > 1) params.set("page", String(page));
    router.replace(`/notifications${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }, [filter, page, router]);

  const { data, error, loading, reload } = useAsync(() => notificationsApi.list({ unread: filter === "unread", page, pageSize: 15 }), [filter, page]);

  const changed = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

  const open = async (n: AppNotification) => {
    if (!n.read) {
      await notificationsApi.markRead(n.id).catch(() => {});
      changed();
    }
    if (n.link) router.push(n.link);
    else reload(true);
  };

  const markAll = async () => {
    setMarking(true);
    try {
      const updated = await notificationsApi.markAllRead();
      toast(updated > 0 ? `Marked ${updated} as read.` : "Everything was already read.");
      changed();
      reload(true);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="container max-w-3xl pb-16 pt-10 md:pt-12">
      <PageHeader eyebrow="Inbox" title="Notifications"
        actions={<button className="btn-outline" onClick={markAll} disabled={marking || !data || data.unreadCount === 0}>{marking ? <Spinner className="h-4 w-4" /> : <CheckCheck className="h-4 w-4" />} Mark all as read</button>}>
        Course reviews, feedback on your quizzes, replies to your comments and answers to your reports.
      </PageHeader>

      <Tabs className="mb-4" value={filter} onChange={(f) => { setFilter(f); setPage(1); }}
        tabs={[{ id: "all", label: "All" }, { id: "unread", label: <>Unread{data && data.unreadCount > 0 && <span className="ml-1.5 rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{data.unreadCount}</span>}</> }]} />

      {loading && !data ? <PageLoader /> : error || !data ? <ErrorState error={error} onRetry={reload} /> : data.items.length === 0 ? (
        <div className="card"><EmptyState icon={<Bell className="h-6 w-6" />} title={filter === "unread" ? "You're all caught up" : "No notifications yet"} /></div>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden" aria-live="polite">
          {data.items.map((n) => (
            <li key={n.id}>
              <button onClick={() => open(n)} className={cx("flex w-full items-start gap-3 px-5 py-4 text-left transition-colors duration-150 hover:bg-ivory", !n.read && "bg-brand-tint/40")}>
                <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cx("block text-sm", n.read ? "text-ink" : "font-semibold text-ink")}>{n.title}</span>
                  {n.body && <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-ink-muted">{n.body}</span>}
                  <span className="mt-1 block text-[11px] text-ink-soft">{timeAgo(n.at)}{!n.read && <span className="sr-only"> · unread</span>}</span>
                </span>
                {n.link && <span className="self-center text-xs font-semibold text-brand">Open</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && data.totalPages > 1 && <div className="mt-4"><Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} /></div>}
      <p className="mt-6 text-center text-xs text-ink-soft"><Link href="/" className="hover:underline">Back to IELTStudy</Link></p>
    </div>
  );
}

export default function NotificationsPage() {
  return <RequireRole roles={["learner", "instructor", "admin"]}><Suspense><NotificationsInner /></Suspense></RequireRole>;
}
