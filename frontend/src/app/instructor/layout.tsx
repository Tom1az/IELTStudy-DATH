"use client";

import { BookOpen, LayoutDashboard, ListChecks } from "lucide-react";
import { RequireRole } from "@/lib/auth-context";
import { AppShell } from "@/components/layout/AppShell";

// Grading, learners and analytics have stub pages but no backend yet, so they are not in the menu
const NAV = [
  { href: "/instructor", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
  { href: "/instructor/courses", label: "Courses", icon: <BookOpen className="h-4 w-4" /> },
  { href: "/instructor/questions", label: "Question bank", icon: <ListChecks className="h-4 w-4" /> },
];

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  return (
    // Only the course owner (an instructor) can edit a course and its lessons
    <RequireRole roles={["instructor"]}>
      <AppShell section="Instructor studio" nav={NAV}>{children}</AppShell>
    </RequireRole>
  );
}
