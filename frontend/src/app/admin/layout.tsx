"use client";

import { BookOpen, LayoutDashboard, Users } from "lucide-react";
import { RequireRole } from "@/lib/auth-context";
import { AppShell } from "@/components/layout/AppShell";

// Skills, reports, evaluation and audit have stub pages but no backend yet, so they are not in the menu
const NAV = [
  { href: "/admin", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
  { href: "/admin/users", label: "Users", icon: <Users className="h-4 w-4" /> },
  { href: "/admin/courses", label: "Courses & review", icon: <BookOpen className="h-4 w-4" /> },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={["admin"]}>
      <AppShell section="Admin" nav={NAV}>{children}</AppShell>
    </RequireRole>
  );
}
