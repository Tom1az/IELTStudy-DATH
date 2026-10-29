"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { BookOpen, ChartNoAxesCombined, History, House, LogOut, PenLine, Target } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/components/ui";
import { band, cx } from "@/lib/format";
import { Logo } from "./Logo";

interface LearnerNavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Only highlight on this exact path (My learning would otherwise also match its History sub-page). */
  exact?: boolean;
}

const NAV: LearnerNavItem[] = [
  { href: "/my-learning", label: "My learning", icon: <House className="h-5 w-5" />, exact: true },
  { href: "/courses", label: "Courses", icon: <BookOpen className="h-5 w-5" /> },
  { href: "/practice", label: "Practice", icon: <PenLine className="h-5 w-5" /> },
  { href: "/mastery", label: "Mastery", icon: <ChartNoAxesCombined className="h-5 w-5" /> },
  { href: "/my-learning/history", label: "History", icon: <History className="h-5 w-5" /> },
];

/** Figma "My learning" layout for learners: a sidebar on desktop and a bottom bar on phones. */
export function LearnerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const isActive = (n: LearnerNavItem) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/"));
  const doLogout = () => { logout(); router.push("/"); };

  return (
    <div className="flex min-h-screen bg-ivory">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col gap-9 overflow-y-auto border-r border-line bg-white p-6 lg:flex">
        <Logo href="/my-learning" />
        <nav className="flex flex-col gap-2" aria-label="Main">
          <p className="text-[10px] font-bold uppercase tracking-eyebrow text-ink-muted">Your workspace</p>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isActive(n) ? "page" : undefined}
              className={cx("flex h-12 items-center gap-3.5 rounded-lg px-3.5 text-sm transition-colors", isActive(n) ? "bg-brand font-bold text-white" : "font-medium text-ink hover:bg-brand-tint")}>
              {n.icon}
              {n.label}
            </Link>
          ))}
        </nav>

        {user && (
          <div className="flex flex-col gap-3.5 rounded-2xl bg-brand-tint p-[18px]">
            <Target className="h-7 w-7 text-brand" aria-hidden />
            {user.targetBand > 0 ? (
              <>
                <p className="text-sm font-bold">Your next chapter</p>
                <p className="text-xs leading-relaxed text-ink-muted">Band {band(user.targetBand)} is your goal. Let&apos;s get there, one skill at a time.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold">Set your target</p>
                <p className="text-xs leading-relaxed text-ink-muted">Pick the band you are aiming for so you can track the gap.</p>
              </>
            )}
            <Link href="/profile" className="text-[11px] font-bold text-brand hover:underline">{user.targetBand > 0 ? "Change target band" : "Set target band"}</Link>
          </div>
        )}

        <div className="flex-1" />

        {user && (
          <div className="flex items-center gap-3">
            <Link href="/profile" className="flex min-w-0 flex-1 items-center gap-3" aria-label="Profile and settings">
              <Avatar name={user.name} size={40} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold">{user.name}</span>
                <span className="block text-[11px] text-ink-muted">Learner</span>
              </span>
            </Link>
            <button onClick={doLogout} className="rounded-lg p-2 text-ink-muted hover:bg-brand-tint hover:text-ink" aria-label="Log out" title="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone top bar: brand + profile (the Figma phone frames have no sidebar) */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-ivory/95 px-4 backdrop-blur lg:hidden">
          <Logo href="/my-learning" />
          {user && (
            <Link href="/profile" aria-label="Profile and settings"><Avatar name={user.name} size={34} /></Link>
          )}
        </header>

        {/* Bottom padding keeps content clear of the phone bottom bar */}
        <main id="main" className="flex-1 pb-24 lg:pb-0">{children}</main>
      </div>

      {/* Phone bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Mobile">
        <div className="mx-auto flex max-w-md justify-between px-3 pt-2.5 pb-2">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isActive(n) ? "page" : undefined}
              className={cx("flex w-16 flex-col items-center gap-1 text-[10px]", isActive(n) ? "font-bold text-brand" : "font-medium text-ink-muted")}>
              {n.icon}
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
