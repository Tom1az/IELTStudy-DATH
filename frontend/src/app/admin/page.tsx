"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { adminApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { SKILL_META } from "@/lib/format";
import { SKILL_CATEGORIES } from "@/lib/types";
import { ErrorState, PageHeader, PageLoader, ProgressBar, StatCard } from "@/components/ui";
import { MOCK_STATS_EXTRAS } from "@/lib/mock/stats";

const STATUS_LABEL = { draft: "Draft", pending_review: "Waiting for review", approved: "Approved", rejected: "Rejected", archived: "Archived" };

/** The usage statistics `GET /admin/stats` counts. Completion and learning figures are mock data for now. */
export default function AdminHome() {
  const { data, error, loading, reload } = useAsync(() => adminApi.stats(), []);
  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const s = data;
  const pending = s.courses.byStatus.pending_review;

  const courseRows = MOCK_STATS_EXTRAS.completion.courses.map((c) => ({
    ...c,
    pct: c.enrolled ? Math.round((c.completed / c.enrolled) * 100) : 0,
  }));
  const averageCompletion = courseRows.length
    ? Math.round(courseRows.reduce((sum, c) => sum + c.pct, 0) / courseRows.length)
    : 0;
  const { averageScorePct, masteryBySkill } = MOCK_STATS_EXTRAS.learning;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Admin" title="Platform overview">Users, courses, enrolments and quiz activity across the platform.</PageHeader>
      {pending > 0 && (
        <Link href="/admin/courses" className="mb-6 flex items-center justify-between rounded-2xl border border-skill-r/40 bg-skill-r-bg px-5 py-4 text-sm font-semibold text-skill-r-ink">
          {pending} course{pending > 1 ? "s" : ""} waiting for review <ArrowRight className="h-4 w-4" />
        </Link>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={s.users.total} sub={`${s.users.active} active · ${s.users.inactive} suspended`} />
        <StatCard label="Active learners" value={s.activeLearnersLast7Days} sub="finished a quiz in the last 7 days" />
        <StatCard label="Enrolments" value={s.enrollments} sub="across all courses" />
        <StatCard label="Quiz attempts" value={s.attempts.completed} sub={`${s.attempts.completedLast7Days} in the last 7 days`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Users by role</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            <li className="flex justify-between py-2.5"><span>Learners</span><span className="font-semibold tabular-nums">{s.users.byRole.learner}</span></li>
            <li className="flex justify-between py-2.5"><span>Instructors</span><span className="font-semibold tabular-nums">{s.users.byRole.instructor}</span></li>
            <li className="flex justify-between py-2.5"><span>Admins</span><span className="font-semibold tabular-nums">{s.users.byRole.admin}</span></li>
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Courses by status <span className="text-sm font-normal text-ink-muted">· {s.courses.total} in total</span></h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((status) => (
              <li key={status} className="flex justify-between py-2.5"><span>{STATUS_LABEL[status]}</span><span className="font-semibold tabular-nums">{s.courses.byStatus[status]}</span></li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Completion</h2>
          <p className="text-sm text-ink-muted">Average across courses: <span className="font-semibold text-ink">{averageCompletion}%</span></p>
          <ul className="mt-4 space-y-4">
            {courseRows.map((c) => (
              <li key={c.courseId}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-semibold">{c.title}</span>
                  <span className="whitespace-nowrap tabular-nums text-ink-muted">{c.completed} of {c.enrolled} finished · {c.pct}%</span>
                </div>
                <div className="mt-1.5"><ProgressBar value={c.pct} label={`${c.title} completion`} /></div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Learning results</h2>
          <p className="text-sm text-ink-muted">Average quiz score: <span className="font-semibold text-ink">{averageScorePct}%</span></p>
          <ul className="mt-4 space-y-4">
            {SKILL_CATEGORIES.map((skill) => {
              const pct = Math.round(masteryBySkill[skill] * 100);
              return (
                <li key={skill}>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{SKILL_META[skill].label}</span>
                    <span className="tabular-nums text-ink-muted">Mastery {pct}%</span>
                  </div>
                  <div className="mt-1.5"><ProgressBar value={pct} label={`${SKILL_META[skill].label} mastery`} /></div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <p className="mt-4 text-xs text-ink-soft">Completion and learning figures are sample data until the stats endpoint returns them.</p>
    </div>
  );
}
