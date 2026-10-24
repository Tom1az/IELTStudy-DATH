"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { instructorApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import { ErrorState, PageHeader, PageLoader, ProgressBar, StatCard } from "@/components/ui";
import { CourseStatusPill } from "@/components/studio/CourseStatusPill";
import { timeAgo } from "@/lib/format";

export default function InstructorHome() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(async () => {
    const [courses, subs] = await Promise.all([instructorApi.courses(), instructorApi.submissions({ status: "submitted" })]);
    const learners = await Promise.all(courses.filter((c) => c.status === "published").map((c) => instructorApi.learners(c.id).then((rows) => rows.map((r) => ({ ...r, course: c.title })))));
    return { courses, subs, atRisk: learners.flat().filter((r) => r.risk === "at_risk") };
  }, []);
  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const { courses, subs, atRisk } = data;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Instructor studio" title={`Hello, ${user?.name.split(" ")[0]}`} actions={<Link href="/instructor/courses/new" className="btn-primary"><Plus className="h-4 w-4" /> New course</Link>}>
        Your courses, submissions waiting for grading and learners who may need a nudge.
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Courses" value={courses.length} sub={`${courses.filter((c) => c.status === "published").length} published`} />
        <StatCard label="Learners" value={courses.reduce((n, c) => n + c.learners, 0)} sub="active enrollments" />
        <StatCard label="To grade" value={subs.length} sub="writing submissions" accent={subs.length ? "text-brand" : undefined} />
        <StatCard label="At risk" value={atRisk.length} sub="learners flagged by early warning" accent={atRisk.length ? "text-brand" : undefined} />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-serif text-2xl font-bold">Your courses</h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="table-base min-w-[720px]">
            <thead><tr><th>Course</th><th>Status</th><th>Lessons</th><th>Learners</th><th className="w-44">Avg progress</th><th>Completion</th><th /></tr></thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td><p className="font-semibold">{c.title}</p><p className="text-xs text-ink-muted">Level {c.level} · {c.bandRange}</p></td>
                  <td><CourseStatusPill status={c.status} /></td>
                  <td>{c.lessonCount}{c.hiddenLessons ? <span className="text-xs text-ink-muted"> ({c.hiddenLessons} hidden)</span> : null}</td>
                  <td>{c.learners}</td>
                  <td><ProgressBar value={c.avgProgress} label="Average progress" /><span className="text-xs text-ink-muted">{c.avgProgress}%</span></td>
                  <td>{c.completionRate}%</td>
                  <td><Link href={`/instructor/courses/${c.id}`} className="font-semibold text-brand hover:underline">Manage</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center justify-between"><h2 className="font-serif text-xl font-bold">Waiting for grading</h2><Link href="/instructor/grading" className="text-sm font-semibold text-brand">Open grading <ArrowRight className="inline h-3.5 w-3.5" /></Link></div>
          <ul className="mt-3 divide-y divide-line">
            {subs.slice(0, 5).map((s) => <li key={s.id} className="py-2.5"><p className="text-sm font-semibold">{s.userName} · {s.assignment.title}</p><p className="text-xs text-ink-muted">{s.wordCount} words · submitted {timeAgo(s.submittedAt)}{s.late ? " · late" : ""}</p></li>)}
            {!subs.length && <li className="py-3 text-sm text-ink-muted">Nothing to grade. Nice work.</li>}
          </ul>
        </section>
        <section className="card p-5">
          <div className="flex items-center justify-between"><h2 className="font-serif text-xl font-bold">Early warning</h2><Link href="/instructor/learners" className="text-sm font-semibold text-brand">All learners <ArrowRight className="inline h-3.5 w-3.5" /></Link></div>
          <ul className="mt-3 divide-y divide-line">
            {atRisk.slice(0, 5).map((r) => <li key={r.userId + r.course} className="py-2.5"><p className="text-sm font-semibold">{r.name} <span className="font-normal text-ink-muted">· {r.course}</span></p><p className="text-xs text-brand">{r.riskReasons.join(" · ")}</p></li>)}
            {!atRisk.length && <li className="py-3 text-sm text-ink-muted">No learners are at risk right now.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
