"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/lib/mock/social";
import { cx, timeAgo } from "@/lib/format";

/** Bell with the unread count and the five newest notifications. Used in the header and the learner sidebar. */
export function NotificationBell({ className }: { className?: string }) {
  const { items, unread, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className={cx("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative rounded-full p-2 text-ink transition-colors hover:bg-line/50"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white" aria-hidden>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={markAllRead}>Mark all read</button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">Nothing new yet.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {items.slice(0, 5).map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.link ?? "/notifications"}
                    onClick={() => { markRead(n.id); setOpen(false); }}
                    className={cx("block px-4 py-3 transition-colors hover:bg-ivory", !n.readAt && "bg-brand-tint/40")}
                  >
                    <p className={cx("text-sm", !n.readAt ? "font-bold" : "font-semibold text-ink-muted")}>{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{n.body}</p>
                    <p className="mt-1 text-[11px] text-ink-soft">{timeAgo(n.createdAt)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-3 text-center text-sm font-semibold text-brand hover:bg-ivory">
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
