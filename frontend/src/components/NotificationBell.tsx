"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { notificationsApi } from "@/lib/api";
import { cx } from "@/lib/format";

// Other tabs and the notifications page announce changes with this event, so the badge updates
export const NOTIFICATIONS_CHANGED = "ieltstudy:notifications-changed";
const POLL_MS = 60_000;

/** The bell with the number of unread notifications. Checks again on every page change and each minute. */
export function NotificationBell({ className }: { className?: string }) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      notificationsApi.unreadCount().then((n) => alive && setCount(n)).catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
    };
  }, [pathname]);

  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <Link href="/notifications" aria-label={label} title={label}
      className={cx("relative inline-flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors duration-150 hover:bg-brand-tint", pathname === "/notifications" && "bg-brand-tint text-brand", className)}>
      <Bell className="h-5 w-5" aria-hidden />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[18px] text-white" aria-hidden>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
