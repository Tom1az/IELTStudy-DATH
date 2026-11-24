"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { adminApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { SKILL_META } from "@/lib/format";
import { ErrorState, PageHeader, PageLoader, ProgressBar, StatCard } from "@/components/ui";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);

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
      <PageHeader eyebrow="Admin" title="Platform overview">Users, courses, enrolments, course completion and learning results across the platform.</PageHeader>
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

      {/* Completion: brief §4.6 */}
      <h2 className="mb-3 mt-10 text-xl font-extrabold">Course completion</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Average progress" value={pct(s.completion.averageProgressPercent)} sub="share of core lessons completed, over all enrolments" />
        <StatCard label="Completion rate" value={pct(s.completion.completionRatePercent)} sub="enrolments with every core lesson completed" />
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="table-base min-w-[620px]">
          <thead><tr><th>Approved course</th><th>Core lessons</th><th>Enrolled</th><th>Completed</th><th className="w-[220px]">Average progress</th></tr></thead>
          <tbody>
            {s.completion.courses.length === 0 && <tr><td colSpan={5} className="text-center text-ink-muted">No approved courses yet.</td></tr>}
            {s.completion.courses.map((c) => (
              <tr key={c.courseId}>
                <td className="font-semibold">{c.title}</td>
                <td className="tabular-nums">{c.coreLessons}</td>
                <td className="tabular-nums">{c.enrolled}</td>
                <td className="tabular-nums">{c.completed} <span className="text-xs text-ink-muted">({pct(c.completionRatePercent)})</span></td>
                <td><div className="flex items-center gap-2"><div className="flex-1"><ProgressBar value={c.averageProgressPercent ?? 0} label={`${c.title} average progress`} /></div><span className="w-10 text-right text-xs tabular-nums">{pct(c.averageProgressPercent)}</span></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Learning results: brief §4.6 */}
      <h2 className="mb-3 mt-10 text-xl font-extrabold">Learning results</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Average quiz score" value={pct(s.learning.averageScorePercent)} sub={`correct answers over ${s.learning.scoredAttempts} completed attempts`} />
        <StatCard label="Average mastery" value={s.learning.averageMastery === null ? "—" : s.learning.averageMastery.toFixed(2)} sub="BKT probability, over measured learner skills" />
        <StatCard label="Skills mastered" value={pct(s.learning.masteredPercent)} sub="learner skills at or above 0.65" />
      </div>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="card p-5">
          <h3 className="text-base font-extrabold">Mastery by skill</h3>
          <ul className="mt-3 space-y-3">
            {s.learning.byCategory.map((c) => (
              <li key={c.category}>
                <div className="mb-1 flex justify-between text-sm"><span>{SKILL_META[c.category].label}</span><span className="tabular-nums text-ink-muted">{c.averageMastery === null ? "—" : c.averageMastery.toFixed(2)} · {c.learners} learners</span></div>
                <ProgressBar value={(c.averageMastery ?? 0) * 100} color={SKILL_META[c.category].bar} label={`${SKILL_META[c.category].label} average mastery`} />
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h3 className="text-base font-extrabold">Weakest micro-skills</h3>
          <p className="text-xs text-ink-muted">Lowest average mastery first: where new remedial content helps most.</p>
          <ul className="mt-3 divide-y divide-line text-sm">
            {s.learning.bySkill.filter((k) => k.averageMastery !== null).sort((a, b) => (a.averageMastery ?? 0) - (b.averageMastery ?? 0)).slice(0, 8).map((k) => (
              <li key={k.skillId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{k.name} <span className="text-xs text-ink-muted">· {SKILL_META[k.category].label}</span></span>
                <span className="shrink-0 font-semibold tabular-nums">{k.averageMastery!.toFixed(2)}</span>
              </li>
            ))}
            {s.learning.bySkill.every((k) => k.averageMastery === null) && <li className="py-2 text-ink-muted">No mastery measured yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
