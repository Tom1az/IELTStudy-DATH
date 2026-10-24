"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, LayoutDashboard, LogOut, Menu, Settings, Shield, User as UserIcon, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { meApi } from "@/lib/api";
import { Avatar } from "@/components/ui";
import { cx } from "@/lib/format";
import { Logo } from "./Logo";

const NAV = [
  { href: "/courses", label: "Courses" },
  { href: "/my-learning", label: "My learning" },
  { href: "/practice", label: "Practice sets" },
];

export function useUnreadCount() {
  const { user } = useAuth();
  const [n, setN] = useState(0);
  const pathname = usePathname();
  useEffect(() => {
    if (!user) return setN(0);
    meApi.notifications().then((list) => setN(list.filter((x) => !x.read).length)).catch(() => setN(0));
  }, [user, pathname]);
  return n;
}

export function SiteHeader() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const unread = useUnreadCount();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); setMenu(false); }, [pathname]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const doLogout = () => { logout(); router.push("/"); };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-cream/95 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <div className="container flex h-[70px] items-center gap-10">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cx("text-[15px] transition-colors", active(n.href) ? "font-semibold text-brand" : "text-navy hover:text-brand")} aria-current={active(n.href) ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
          {user?.role === "instructor" && <Link href="/instructor" className="text-[15px] text-navy hover:text-brand">Studio</Link>}
          {user?.role === "admin" && <Link href="/admin" className="text-[15px] text-navy hover:text-brand">Admin</Link>}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {!user ? (
            <>
              <Link href="/login" className="hidden px-3 py-2 text-[15px] text-navy hover:text-brand sm:inline">Log in</Link>
              <Link href="/register" className="btn-dark hidden sm:inline-flex">Sign up</Link>
            </>
          ) : (
            <>
              <Link href="/notifications" className="relative rounded-full p-2 text-navy hover:bg-sand" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
                <Bell className="h-5 w-5" />
                {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{unread}</span>}
              </Link>
              <div className="relative" ref={menuRef}>
                <button className="flex items-center gap-1 rounded-full" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu">
                  <Avatar name={user.name} size={40} />
                  <ChevronDown className="hidden h-4 w-4 text-ink-muted sm:block" />
                </button>
                {menu && (
                  <div role="menu" className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg">
                    <div className="border-b border-line px-4 py-3">
                      <p className="truncate text-sm font-semibold">{user.name}</p>
                      <p className="truncate text-xs text-ink-muted">{user.email}</p>
                    </div>
                    {user.role === "learner" && <MenuLink href="/my-learning" icon={<LayoutDashboard className="h-4 w-4" />}>My learning</MenuLink>}
                    {user.role === "learner" && <MenuLink href="/mastery" icon={<Settings className="h-4 w-4" />}>Skill mastery map</MenuLink>}
                    {user.role === "instructor" && <MenuLink href="/instructor" icon={<LayoutDashboard className="h-4 w-4" />}>Instructor studio</MenuLink>}
                    {user.role === "admin" && <MenuLink href="/admin" icon={<Shield className="h-4 w-4" />}>Admin panel</MenuLink>}
                    <MenuLink href="/profile" icon={<UserIcon className="h-4 w-4" />}>Profile & settings</MenuLink>
                    <button role="menuitem" onClick={doLogout} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink hover:bg-cream">
                      <LogOut className="h-4 w-4" /> Log out
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          <button className="rounded-lg p-2 text-navy hover:bg-sand md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Open menu" aria-expanded={open}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line bg-cream px-4 pb-4 md:hidden" aria-label="Mobile">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cx("block rounded-lg px-3 py-3 text-base", active(n.href) ? "font-semibold text-brand" : "text-navy")}>{n.label}</Link>
          ))}
          {user?.role === "instructor" && <Link href="/instructor" className="block rounded-lg px-3 py-3 text-navy">Instructor studio</Link>}
          {user?.role === "admin" && <Link href="/admin" className="block rounded-lg px-3 py-3 text-navy">Admin panel</Link>}
          {!user && (
            <div className="mt-2 flex gap-2 px-3">
              <Link href="/login" className="btn-outline flex-1">Log in</Link>
              <Link href="/register" className="btn-dark flex-1">Sign up</Link>
            </div>
          )}
        </nav>
      )}
    </header>
  );
}

function MenuLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link role="menuitem" href={href} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink hover:bg-cream">
      {icon}
      {children}
    </Link>
  );
}

export function SiteFooter({ withLogo }: { withLogo?: boolean }) {
  return (
    <footer className="bg-navy text-white">
      <div className={cx("container flex flex-col gap-4 py-10 md:flex-row md:items-center", withLogo ? "md:justify-between md:py-14" : "")}>
        {withLogo && <Logo light />}
        <p className={cx("text-xs leading-relaxed text-white/80", withLogo && "max-w-md")}>
          IELTStudy is an independent practice platform and is not affiliated with the owners of the IELTS test.
          {withLogo && " Estimated bands are practice indicators, not official scores."}
        </p>
      </div>
    </footer>
  );
}
