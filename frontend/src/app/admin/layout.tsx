"use client";

import { BookOpen, LayoutDashboard, ScrollText, Users } from "lucide-react";
import { RequireRole } from "@/lib/auth-context";
import { AppShell } from "@/components/layout/AppShell";

// Skills, reports and evaluation still have stub pages with no backend, so they stay out of
// the menu. The audit log is in: it reads `GET /admin/audit` and says so when that isn't there.
const NAV = [
  { href: "/admin", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
  { href: "/admin/users", label: "Users", icon: <Users className="h-4 w-4" /> },
  { href: "/admin/courses", label: "Courses & review", icon: <BookOpen className="h-4 w-4" /> },
  { href: "/admin/audit", label: "Audit log", icon: <ScrollText className="h-4 w-4" /> },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={["admin"]}>
      <AppShell section="Admin" nav={NAV}>{children}</AppShell>
    </RequireRole>
  );
}
