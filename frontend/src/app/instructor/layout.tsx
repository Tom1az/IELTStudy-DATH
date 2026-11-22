"use client";

import { BookOpen, ClipboardCheck, LayoutDashboard, ListChecks, Users } from "lucide-react";
import { RequireRole } from "@/lib/auth-context";
import { AppShell } from "@/components/layout/AppShell";

// Analytics is still a stub with no backend, so it stays out of the menu. Grading and
// learners are in: both say so on the page while their endpoints are missing.
const NAV = [
  { href: "/instructor", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
  { href: "/instructor/courses", label: "Courses", icon: <BookOpen className="h-4 w-4" /> },
  { href: "/instructor/questions", label: "Question bank", icon: <ListChecks className="h-4 w-4" /> },
  { href: "/instructor/grading", label: "Grading", icon: <ClipboardCheck className="h-4 w-4" /> },
  { href: "/instructor/learners", label: "Learners", icon: <Users className="h-4 w-4" /> },
];

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  return (
    // Only the course owner (an instructor) can edit a course and its lessons
    <RequireRole roles={["instructor"]}>
      <AppShell section="Instructor studio" nav={NAV}>{children}</AppShell>
    </RequireRole>
  );
}
