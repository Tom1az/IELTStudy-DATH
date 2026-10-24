"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { practiceApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { RequireRole } from "@/lib/auth-context";
import type { SkillCategory } from "@/lib/types";
import { SKILL_CATEGORIES } from "@/lib/types";
import { SKILL_HEX, SKILL_META, fmtDate } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, PageLoader, Pagination, Select } from "@/components/ui";
import { LineChart } from "@/components/charts";

function HistoryInner() {
  const { data, error, loading, reload } = useAsync(() => practiceApi.history(), []);
  const [skill, setSkill] = useState<SkillCategory | "all">("all");
  const [page, setPage] = useState(1);

  const series = useMemo(() => {
    if (!data) return [];
    const practice = [...data].filter((a) => a.kind === "practice").reverse();
    return SKILL_CATEGORIES.map((c) => {
      const pts = practice.filter((a) => a.set.skill === c).map((a) => a.score / a.max);
      // rolling average of the last 3 attempts
      const vals = pts.map((_, i) => { const w = pts.slice(Math.max(0, i - 2), i + 1); return w.reduce((x, y) => x + y, 0) / w.length; });
      return { name: SKILL_META[c].label, color: SKILL_HEX[c], values: vals };
    }).filter((s) => s.values.length > 1);
  }, [data]);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const rows = data.filter((a) => skill === "all" || a.set.skill === skill);
  const per = 12;
  const pages = Math.max(1, Math.ceil(rows.length / per));

  return (
    <div className="container pb-16 pt-10 md:pt-12">
      <PageHeader eyebrow="My learning" title="Practice history" actions={<Link href="/my-learning" className="btn-outline">Back to My learning</Link>}>
        Every submitted attempt, including your placement quiz. Open any attempt to see answers and explanations.
      </PageHeader>
      {series.length > 0 && (
        <section className="card mb-6 p-5">
          <h2 className="font-serif text-lg font-bold">Accuracy trend by skill</h2>
          <p className="text-xs text-ink-muted">Rolling average of your last three attempts in each skill.</p>
          <div className="mt-4"><LineChart series={series} /></div>
        </section>
      )}
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">{rows.length} attempts</p>
        <div className="w-48"><Select value={skill} onChange={(e) => { setSkill(e.target.value as SkillCategory | "all"); setPage(1); }} aria-label="Filter by skill">
          <option value="all">All skills</option>
          {SKILL_CATEGORIES.map((c) => <option key={c} value={c}>{SKILL_META[c].label}</option>)}
        </Select></div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        {rows.length === 0 ? <EmptyState title="No attempts yet" /> : (
          <table className="table-base min-w-[640px]">
            <thead><tr><th>Practice set</th><th>Course</th><th>Skill</th><th>Score</th><th>Date</th><th /></tr></thead>
            <tbody>
              {rows.slice((page - 1) * per, page * per).map((r) => (
                <tr key={r.attemptId}>
                  <td className="font-semibold">{r.kind === "placement" ? `Placement · ${r.set.title}` : `Practice set ${r.set.code} · ${r.set.title}`}</td>
                  <td className="text-ink-muted">{r.courseLevelName}</td>
                  <td>{SKILL_META[r.set.skill].label}</td>
                  <td className="font-semibold tabular-nums">{r.score} / {r.max} <span className="ml-1 text-xs font-normal text-ink-muted">{Math.round((r.score / r.max) * 100)}%</span></td>
                  <td className="text-ink-muted">{fmtDate(r.completedAt)}</td>
                  <td>{r.kind === "practice" && <Link href={`/practice/result/${r.attemptId}`} className="font-semibold text-brand hover:underline">Review</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-4"><Pagination page={page} totalPages={pages} onChange={setPage} /></div>
    </div>
  );
}

export default function HistoryPage() {
  return <RequireRole roles={["learner"]}><HistoryInner /></RequireRole>;
}
