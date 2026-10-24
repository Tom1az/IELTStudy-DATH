"use client";

import { instructorApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { SKILL_HEX, SKILL_META } from "@/lib/format";
import { ErrorState, PageLoader, StatCard } from "@/components/ui";
import { BarChart } from "@/components/charts";

export function CourseAnalytics({ courseId }: { courseId: string }) {
  const { data, error, loading, reload } = useAsync(() => instructorApi.analytics(courseId), [courseId]);
  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const attempted = data.sets.filter((s) => s.avgPct !== null);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Learners" value={data.learners} />
        <StatCard label="Average progress" value={`${data.avgProgress}%`} />
        <StatCard label="Completion rate" value={`${data.completionRate}%`} />
      </div>
      <section className="card p-5">
        <h3 className="font-serif text-lg font-bold">Average score per practice set</h3>
        <p className="text-xs text-ink-muted">Only sets with at least one submitted attempt. Hover for the exact value.</p>
        {attempted.length ? (
          <div className="mt-4 overflow-x-auto"><div className="min-w-[640px]"><BarChart data={attempted.map((s) => ({ label: s.code, value: s.avgPct ?? 0 }))} format={(v) => `${v}%`} color="#0E5C5C" /></div></div>
        ) : <p className="mt-4 text-sm text-ink-muted">No attempts yet.</p>}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="font-serif text-lg font-bold">Hardest questions</h3>
          <p className="text-xs text-ink-muted">Lowest share of correct answers (3+ responses). Check the wording or answer key.</p>
          <ul className="mt-3 divide-y divide-line">
            {data.hardest.map((q) => (
              <li key={q.id} className="flex items-start gap-3 py-2.5">
                <span className="w-12 shrink-0 text-xs font-semibold text-ink-muted">Set {q.setCode}</span>
                <span className="flex-1 text-sm">{q.prompt}</span>
                <span className="whitespace-nowrap text-sm font-semibold text-brand">{q.pctCorrect}%</span>
              </li>
            ))}
            {!data.hardest.length && <li className="py-3 text-sm text-ink-muted">Not enough responses yet.</li>}
          </ul>
        </section>
        <section className="card p-5">
          <h3 className="font-serif text-lg font-bold">Class mastery by micro-skill</h3>
          <p className="text-xs text-ink-muted">Average BKT mastery of enrolled learners, weakest first.</p>
          <ul className="mt-3 space-y-2">
            {data.skillMastery.slice(0, 10).map((s) => (
              <li key={s.skillId} className="flex items-center gap-3 text-sm">
                <span className="w-48 truncate">{s.name}</span>
                <span className="relative h-2 flex-1 rounded-full bg-sand"><span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${s.avg * 100}%`, background: s.avg < 0.65 ? "#C3410D" : "#0E5C5C" }} /></span>
                <span className="w-10 text-right tabular-nums">{s.avg.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="card p-5">
        <h3 className="font-serif text-lg font-bold">Attempts by set</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="table-base min-w-[560px]">
            <thead><tr><th>Set</th><th>Skill</th><th>Attempts</th><th>Average</th></tr></thead>
            <tbody>{data.sets.map((s) => <tr key={s.id}><td className="font-semibold">{s.code} · {s.title}</td><td><span style={{ color: SKILL_HEX[s.skill] }}>{SKILL_META[s.skill].label}</span></td><td>{s.attempts}</td><td>{s.avgPct === null ? "—" : `${s.avgPct}%`}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
