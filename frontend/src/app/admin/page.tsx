"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { adminApi, USING_MOCK } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { SKILL_HEX, SKILL_META } from "@/lib/format";
import { ConfirmDialog, ErrorState, PageHeader, PageLoader, ProgressBar, StatCard } from "@/components/ui";
import { BarChart } from "@/components/charts";
import { CourseStatusPill } from "@/components/studio/CourseStatusPill";

const wk = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function AdminHome() {
  const { data, error, loading, reload } = useAsync(() => adminApi.stats(), []);
  const [resetting, setResetting] = useState(false);
  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const s = data;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Admin" title="Platform overview" actions={USING_MOCK ? <button className="btn-outline" onClick={() => setResetting(true)}>Reset demo data</button> : undefined}>Enrollments, completion and learning outcomes across all courses.</PageHeader>
      {(s.pendingCourses > 0 || s.openReports > 0) && (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {s.pendingCourses > 0 && <Link href="/admin/courses" className="flex items-center justify-between rounded-2xl border border-skill-r/40 bg-skill-r-bg px-5 py-4 text-sm font-semibold text-skill-r-ink">{s.pendingCourses} course{s.pendingCourses > 1 ? "s" : ""} waiting for review <ArrowRight className="h-4 w-4" /></Link>}
          {s.openReports > 0 && <Link href="/admin/reports" className="flex items-center justify-between rounded-2xl border border-skill-w/30 bg-skill-w-bg px-5 py-4 text-sm font-semibold text-skill-w-ink">{s.openReports} open content report{s.openReports > 1 ? "s" : ""} <ArrowRight className="h-4 w-4" /></Link>}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Learners" value={s.users.learner} sub={`${s.activeLearners7d} active in the last 7 days`} />
        <StatCard label="Enrollments" value={s.enrollments} sub={`${s.activeEnrollments} in progress`} />
        <StatCard label="Completion rate" value={`${s.completionRate}%`} sub="of all enrollments" />
        <StatCard label="Avg practice score" value={`${s.avgPracticeScore}%`} sub={`${s.attempts30d} attempts in 30 days`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5"><h2 className="font-serif text-lg font-bold">New enrollments per week</h2><div className="mt-5"><BarChart data={s.enrollmentsByWeek.map((w) => ({ label: wk(w.week), value: w.count }))} color="#1B2A41" /></div></section>
        <section className="card p-5"><h2 className="font-serif text-lg font-bold">Practice attempts per week</h2><div className="mt-5"><BarChart data={s.attemptsByWeek.map((w) => ({ label: wk(w.week), value: w.count }))} color="#0E5C5C" /></div></section>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="card p-5">
          <h2 className="font-serif text-lg font-bold">Average score by skill</h2>
          <ul className="mt-4 space-y-3.5">
            {s.scoreBySkill.map((x) => (
              <li key={x.skill} className="flex items-center gap-3 text-sm">
                <span className="w-20">{SKILL_META[x.skill].label}</span>
                <div className="flex-1"><ProgressBar value={x.avgPct} color={SKILL_META[x.skill].bar} height="h-2.5" label={`${SKILL_META[x.skill].label} average`} /></div>
                <span className="w-10 text-right font-semibold tabular-nums" style={{ color: SKILL_HEX[x.skill] }}>{x.avgPct}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-muted">{Math.round(s.recommender.belowThresholdShare * 100)}% of learner micro-skills are below the 0.65 mastery target.</p>
        </section>
        <section className="card p-5">
          <h2 className="font-serif text-lg font-bold">Courses</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="table-base min-w-[520px]">
              <thead><tr><th>Course</th><th>Status</th><th>Learners</th><th>Progress</th><th>Completed</th></tr></thead>
              <tbody>{s.courses.map((c) => <tr key={c.id}><td className="font-semibold">{c.title}</td><td><CourseStatusPill status={c.status} /></td><td>{c.learners}</td><td>{c.avgProgress}%</td><td>{c.completionRate}%</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-serif text-lg font-bold">Learners at risk</h2>
          <ul className="mt-3 divide-y divide-line">
            {s.atRisk.slice(0, 8).map((r) => <li key={r.userId + r.courseTitle} className="py-2.5"><p className="text-sm font-semibold">{r.name} <span className="font-normal text-ink-muted">· {r.courseTitle} · {r.pct}%</span></p><p className="text-xs text-brand">{r.riskReasons.join(" · ")}</p></li>)}
            {!s.atRisk.length && <li className="py-3 text-sm text-ink-muted">No learners flagged.</li>}
          </ul>
        </section>
        <section className="card p-5">
          <div className="flex items-center justify-between"><h2 className="font-serif text-lg font-bold">Recommender in production</h2><Link href="/admin/evaluation" className="text-sm font-semibold text-brand">Run evaluation →</Link></div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-cream p-3"><p className="font-serif text-2xl font-bold">{s.recommender.shown}</p><p className="text-xs text-ink-muted">shown</p></div>
            <div className="rounded-xl bg-cream p-3"><p className="font-serif text-2xl font-bold">{(s.recommender.ctr * 100).toFixed(0)}%</p><p className="text-xs text-ink-muted">click-through</p></div>
            <div className="rounded-xl bg-cream p-3"><p className="font-serif text-2xl font-bold">{s.recommender.helpful}/{s.recommender.helpful + s.recommender.notHelpful}</p><p className="text-xs text-ink-muted">rated helpful</p></div>
          </div>
          <p className="mt-3 text-xs text-ink-muted">Counts come from recommendation events logged on the dashboard and post-quiz screens.</p>
        </section>
      </div>
      <ConfirmDialog open={resetting} onClose={() => setResetting(false)} danger title="Reset demo data?" confirmLabel="Reset" onConfirm={async () => { await adminApi.resetDemoData(); window.location.href = "/login"; }}
        body="Restores every course, user and attempt to the seeded state in this browser and signs you out." />
    </div>
  );
}
