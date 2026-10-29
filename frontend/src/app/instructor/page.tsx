"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { instructorApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import { ErrorState, PageHeader, PageLoader, StatCard } from "@/components/ui";
import { CourseStatusPill } from "@/components/studio/CourseStatusPill";

export default function InstructorHome() {
  const { user } = useAuth();
  const { data: courses, error, loading, reload } = useAsync(() => instructorApi.listCourses(), []);
  if (loading && !courses) return <PageLoader />;
  if (error || !courses) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Instructor studio" title={`Hello, ${user?.name.split(" ")[0]}`} actions={<Link href="/instructor/courses/new" className="btn-primary"><Plus className="h-4 w-4" /> New course</Link>}>
        Your courses and where each one is in the review flow.
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Courses" value={courses.length} sub={`${courses.filter((c) => c.status === "published").length} approved`} />
        <StatCard label="Waiting for review" value={courses.filter((c) => c.status === "pending").length} />
        <StatCard label="Changes requested" value={courses.filter((c) => c.status === "rejected").length} accent={courses.some((c) => c.status === "rejected") ? "text-brand" : undefined} />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-2xl font-extrabold">Your courses</h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="table-base min-w-[560px]">
            <thead><tr><th>Course</th><th>Status</th><th>Core lessons</th><th /></tr></thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td><p className="font-semibold">{c.title}</p><p className="text-xs text-ink-muted">Level {c.level} · {c.levelName}</p></td>
                  <td><CourseStatusPill status={c.status} /></td>
                  <td>{c.lessonCount}</td>
                  <td><Link href={`/instructor/courses/${c.id}`} className="font-semibold text-brand hover:underline">Manage</Link></td>
                </tr>
              ))}
              {courses.length === 0 && <tr><td colSpan={4} className="text-sm text-ink-muted">No courses yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
