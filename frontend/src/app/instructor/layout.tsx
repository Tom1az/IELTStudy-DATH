"use client";

import { BarChart3, BookOpen, ClipboardCheck, LayoutDashboard, ListChecks, Users } from "lucide-react";
import { RequireRole } from "@/lib/auth-context";
import { AppShell } from "@/components/layout/AppShell";

const NAV = [
  { href: "/instructor", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
  { href: "/instructor/courses", label: "Courses", icon: <BookOpen className="h-4 w-4" /> },
  { href: "/instructor/questions", label: "Question bank", icon: <ListChecks className="h-4 w-4" /> },
  { href: "/instructor/grading", label: "Grading", icon: <ClipboardCheck className="h-4 w-4" /> },
  { href: "/instructor/learners", label: "Learners", icon: <Users className="h-4 w-4" /> },
  { href: "/instructor/analytics", label: "Analytics", icon: <BarChart3 className="h-4 w-4" /> },
];

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={["instructor", "admin"]}>
      <AppShell section="Instructor studio" nav={NAV}>{children}</AppShell>
    </RequireRole>
  );
}
