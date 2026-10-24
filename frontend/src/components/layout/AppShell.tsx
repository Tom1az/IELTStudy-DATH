"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Bell, ExternalLink, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/components/ui";
import { cx } from "@/lib/format";
import { Logo } from "./Logo";
import { useUnreadCount } from "./SiteHeader";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
  badge?: number;
}

/** Sidebar layout for the Instructor Studio and Admin panel. */
export function AppShell({ section, nav, children }: { section: string; nav: NavItem[]; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  useEffect(() => setOpen(false), [pathname]);

  const active = (n: NavItem) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/"));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <Logo />
        <p className="mt-1 pl-[32px] text-[11px] font-semibold uppercase tracking-eyebrow text-brand">{section}</p>
      </div>
      <nav className="flex-1 space-y-0.5 px-3" aria-label={section}>
        {nav.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n) ? "page" : undefined}
            className={cx("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium", active(n) ? "bg-sand font-semibold text-ink" : "text-ink-muted hover:bg-cream hover:text-ink")}>
            <span className="text-current">{n.icon}</span>
            <span className="flex-1">{n.label}</span>
            {!!n.badge && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{n.badge}</span>}
          </Link>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <Link href="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-cream hover:text-ink"><ExternalLink className="h-4 w-4" /> View learner site</Link>
        <button onClick={() => { logout(); router.push("/"); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-cream hover:text-ink"><LogOut className="h-4 w-4" /> Log out</button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-cream">
      <aside className="sticky top-0 hidden h-screen w-[244px] shrink-0 border-r border-line bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="w-[260px] bg-white">{sidebar}</div>
          <button className="flex-1 bg-navy/40" onClick={() => setOpen(false)} aria-label="Close navigation" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-cream/95 px-4 backdrop-blur md:px-8">
          <button className="rounded-lg p-2 hover:bg-sand lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/notifications" className="relative rounded-full p-2 hover:bg-sand" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{unread}</span>}
            </Link>
            {user && (
              <Link href="/profile" className="flex items-center gap-2.5">
                <span className="hidden text-right sm:block"><span className="block text-sm font-semibold leading-tight">{user.name}</span><span className="block text-xs capitalize text-ink-muted">{user.role}</span></span>
                <Avatar name={user.name} size={36} />
              </Link>
            )}
          </div>
        </header>
        <main id="main" className="flex-1 px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
