"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { practiceApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { RequireRole } from "@/lib/auth-context";
import { SKILL_CATEGORIES } from "@/lib/types";
import { SKILL_HEX, SKILL_META, fmtDate } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, PageLoader, Pagination } from "@/components/ui";
import { LineChart } from "@/components/charts";

const PER_PAGE = 12;

function HistoryInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [page, setPage] = useState(Math.max(1, Number(sp.get("page") ?? 1) || 1));
  useEffect(() => {
    router.replace(`/my-learning/history${page > 1 ? `?page=${page}` : ""}`, { scroll: false });
  }, [page, router]);

  // The table is paged by the backend; the trend chart needs every finished attempt
  const { data, error, loading, reload } = useAsync(() => practiceApi.history({ page, pageSize: PER_PAGE }), [page]);
  const { data: all } = useAsync(() => practiceApi.history(), []);

  const series = useMemo(() => {
    if (!all) return [];
    const practice = [...all.items].filter((a) => a.kind === "practice").reverse();
    return SKILL_CATEGORIES.map((c) => {
      const pts = practice.filter((a) => a.quiz.skill === c).map((a) => a.score / a.max);
      // rolling average of the last 3 attempts
      const vals = pts.map((_, i) => { const w = pts.slice(Math.max(0, i - 2), i + 1); return w.reduce((x, y) => x + y, 0) / w.length; });
      return { name: SKILL_META[c].label, color: SKILL_HEX[c], values: vals };
    }).filter((s) => s.values.length > 1);
  }, [all]);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="container pb-16 pt-10 md:pt-12">
      <PageHeader eyebrow="My learning" title="Quiz history" actions={<Link href="/my-learning" className="btn-outline">Back to My learning</Link>}>
        Every submitted attempt, including your placement quiz. Open any attempt to see answers and explanations.
      </PageHeader>
      {series.length > 0 && (
        <section className="card mb-6 p-5">
          <h2 className="text-lg font-extrabold">Accuracy trend by skill</h2>
          <p className="text-xs text-ink-muted">Rolling average of your last three attempts in each skill.</p>
          <div className="mt-4"><LineChart series={series} /></div>
        </section>
      )}
      <p className="mb-4 text-sm text-ink-muted">{data.total} attempts</p>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        {data.items.length === 0 ? <EmptyState title="No attempts yet" /> : (
          <table className="table-base min-w-[640px]">
            <thead><tr><th>Quiz</th><th>Course</th><th>Skill</th><th>Score</th><th>Date</th><th /></tr></thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.attemptId}>
                  <td className="font-semibold">{r.kind === "placement" ? `Placement · ${r.quiz.title}` : r.quiz.title}</td>
                  <td className="text-ink-muted">{r.courseLevelName}</td>
                  <td>{r.quiz.skill ? SKILL_META[r.quiz.skill].label : "—"}</td>
                  <td className="font-semibold tabular-nums">{r.score} / {r.max} <span className="ml-1 text-xs font-normal text-ink-muted">{Math.round((r.score / r.max) * 100)}%</span></td>
                  <td className="text-ink-muted">{fmtDate(r.completedAt)}</td>
                  <td><Link href={`/practice/result/${r.attemptId}`} className="font-semibold text-brand hover:underline">Review</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-4"><Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} /></div>
    </div>
  );
}

export default function HistoryPage() {
  return <RequireRole roles={["learner"]}><Suspense><HistoryInner /></Suspense></RequireRole>;
}
