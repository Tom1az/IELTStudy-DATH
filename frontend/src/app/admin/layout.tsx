"use client";

import { BookOpen, FlaskConical, Flag, LayoutDashboard, ScrollText, Tags, Users } from "lucide-react";
import { RequireRole } from "@/lib/auth-context";
import { AppShell } from "@/components/layout/AppShell";

const NAV = [
  { href: "/admin", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
  { href: "/admin/users", label: "Users", icon: <Users className="h-4 w-4" /> },
  { href: "/admin/courses", label: "Courses & review", icon: <BookOpen className="h-4 w-4" /> },
  { href: "/admin/skills", label: "Skill taxonomy", icon: <Tags className="h-4 w-4" /> },
  { href: "/admin/reports", label: "Content reports", icon: <Flag className="h-4 w-4" /> },
  { href: "/admin/evaluation", label: "Recommender evaluation", icon: <FlaskConical className="h-4 w-4" /> },
  { href: "/admin/audit", label: "Audit log", icon: <ScrollText className="h-4 w-4" /> },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={["admin"]}>
      <AppShell section="Admin" nav={NAV}>{children}</AppShell>
    </RequireRole>
  );
}
