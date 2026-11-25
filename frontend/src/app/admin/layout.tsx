"use client";

import { BookOpen, Flag, LayoutDashboard, ScrollText, Users } from "lucide-react";
import { RequireRole } from "@/lib/auth-context";
import { AppShell } from "@/components/layout/AppShell";

// Skills and evaluation still have stub pages with no backend, so they stay out of the menu.
// Content reports run on mock data for now (see src/lib/mock/social.ts).
const NAV = [
  { href: "/admin", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
  { href: "/admin/users", label: "Users", icon: <Users className="h-4 w-4" /> },
  { href: "/admin/courses", label: "Courses & review", icon: <BookOpen className="h-4 w-4" /> },
  { href: "/admin/reports", label: "Content reports", icon: <Flag className="h-4 w-4" /> },
  { href: "/admin/audit", label: "Audit log", icon: <ScrollText className="h-4 w-4" /> },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={["admin"]}>
      <AppShell section="Admin" nav={NAV}>{children}</AppShell>
    </RequireRole>
  );
}
