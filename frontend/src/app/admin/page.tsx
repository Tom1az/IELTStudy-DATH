"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { adminApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { ErrorState, PageHeader, PageLoader, StatCard } from "@/components/ui";

const STATUS_LABEL = { draft: "Draft", pending_review: "Waiting for review", approved: "Approved", rejected: "Rejected", archived: "Archived" };

/** The usage statistics `GET /admin/stats` counts. */
export default function AdminHome() {
  const { data, error, loading, reload } = useAsync(() => adminApi.stats(), []);
  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const s = data;
  const pending = s.courses.byStatus.pending_review;
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
          <h2 className="font-serif text-lg font-bold">Users by role</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            <li className="flex justify-between py-2.5"><span>Learners</span><span className="font-semibold tabular-nums">{s.users.byRole.learner}</span></li>
            <li className="flex justify-between py-2.5"><span>Instructors</span><span className="font-semibold tabular-nums">{s.users.byRole.instructor}</span></li>
            <li className="flex justify-between py-2.5"><span>Admins</span><span className="font-semibold tabular-nums">{s.users.byRole.admin}</span></li>
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="font-serif text-lg font-bold">Courses by status <span className="text-sm font-normal text-ink-muted">· {s.courses.total} in total</span></h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((status) => (
              <li key={status} className="flex justify-between py-2.5"><span>{STATUS_LABEL[status]}</span><span className="font-semibold tabular-nums">{s.courses.byStatus[status]}</span></li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
