"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/components/ui";
import { cx } from "@/lib/format";
import { Logo } from "./Logo";

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
  useEffect(() => setOpen(false), [pathname]);

  const active = (n: NavItem) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/"));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <Logo />
        <p className="mt-3 text-[10px] font-bold uppercase tracking-eyebrow text-ink-muted">{section}</p>
      </div>
      <nav className="flex-1 space-y-1.5 px-3" aria-label={section}>
        {nav.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n) ? "page" : undefined}
            className={cx("flex h-11 items-center gap-3 rounded-lg px-3.5 text-sm font-medium", active(n) ? "bg-brand font-bold text-white" : "text-ink hover:bg-brand-tint")}>
            <span className="text-current">{n.icon}</span>
            <span className="flex-1">{n.label}</span>
            {!!n.badge && <span className="rounded-full bg-vanilla px-1.5 py-0.5 text-[10px] font-bold text-ink">{n.badge}</span>}
          </Link>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <Link href="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-brand-tint hover:text-ink"><ExternalLink className="h-4 w-4" /> View learner site</Link>
        <button onClick={() => { logout(); router.push("/"); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-brand-tint hover:text-ink"><LogOut className="h-4 w-4" /> Log out</button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-ivory">
      <aside className="sticky top-0 hidden h-screen w-[244px] shrink-0 border-r border-line bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="w-[260px] bg-white">{sidebar}</div>
          <button className="flex-1 bg-ink/40" onClick={() => setOpen(false)} aria-label="Close navigation" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-ivory/95 px-4 backdrop-blur md:px-8">
          <button className="rounded-lg p-2 hover:bg-brand-tint lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          <div className="ml-auto flex items-center gap-3">
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
