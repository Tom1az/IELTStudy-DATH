"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Search } from "lucide-react";
import { catalogApi, instructorApi } from "@/lib/api";
import { SKILL_CATEGORIES } from "@/lib/types";
import { useAsync, useDebounced } from "@/lib/hooks";
import { SKILL_META, cx } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, PageLoader, Pagination, Select } from "@/components/ui";

const TYPE_LABEL = { tfng: "T/F/NG", ynng: "Y/N/NG", mcq: "Multiple choice", gap: "Gap fill", heading: "Headings" };

function Bank() {
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [courseId, setCourseId] = useState("");
  const [skillId, setSkillId] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const courses = useAsync(() => instructorApi.courses(), []);
  const SKILLS = useAsync(() => catalogApi.skills(), []).data ?? [];
  const { data, error, loading, reload } = useAsync(() => instructorApi.questionBank({ q: dq, courseId: courseId || undefined, skillId: skillId || undefined }), [dq, courseId, skillId]);
  const per = 15;
  const rows = data ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Instructor studio" title="Question bank">Every auto-graded question across your courses with its Q-matrix tags and live accuracy. Low accuracy often means unclear wording or a wrong answer key.</PageHeader>
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px_240px]">
        <label className="relative"><span className="sr-only">Search questions</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" /><input className="input pl-9" placeholder="Search question text or set" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
        <Select value={courseId} onChange={(e) => { setCourseId(e.target.value); setPage(1); }} aria-label="Course"><option value="">All courses</option>{courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>
        <Select value={skillId} onChange={(e) => { setSkillId(e.target.value); setPage(1); }} aria-label="Micro-skill"><option value="">All micro-skills</option>{SKILL_CATEGORIES.map((c) => <optgroup key={c} label={SKILL_META[c].label}>{SKILLS.filter((s) => s.category === c).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}</Select>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <PageLoader /> : (
        <>
          <p className="mb-2 text-sm text-ink-muted">{rows.length} questions</p>
          <div className="overflow-x-auto rounded-2xl border border-line bg-white">
            {rows.length === 0 ? <EmptyState title="No questions match" /> : (
              <table className="table-base min-w-[900px]">
                <thead><tr><th>Question</th><th>Set</th><th>Type</th><th>Skills (weight)</th><th>Diff.</th><th>Correct</th><th /></tr></thead>
                <tbody>
                  {rows.slice((page - 1) * per, page * per).map((x) => (
                    <tr key={x.id}>
                      <td className="max-w-[320px]"><p className="line-clamp-2 text-sm">{x.prompt}</p></td>
                      <td className="text-xs"><p className="font-semibold">{x.setCode} · {x.setTitle}</p><p className="text-ink-muted">{x.courseTitle}</p></td>
                      <td className="text-xs">{TYPE_LABEL[x.type]}</td>
                      <td className="text-xs">{x.skills.map((s) => <span key={s.skillId} className="mb-1 mr-1 inline-block rounded bg-teal-tint px-1.5 py-0.5 text-teal-ink">{s.skillId} {s.weight}</span>)}</td>
                      <td>{x.difficulty}</td>
                      <td className={cx("whitespace-nowrap tabular-nums", x.pctCorrect !== null && x.pctCorrect < 40 && "font-semibold text-brand")}>{x.pctCorrect === null ? "—" : `${x.pctCorrect}%`}<span className="block text-[11px] text-ink-soft">{x.responses} resp.</span></td>
                      <td>{x.lessonId && <Link href={`/instructor/lessons/${x.lessonId}`} className="font-semibold text-brand hover:underline">Edit</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="mt-4"><Pagination page={page} totalPages={Math.max(1, Math.ceil(rows.length / per))} onChange={setPage} /></div>
        </>
      )}
    </div>
  );
}

export default function QuestionBankPage() {
  return <Suspense><Bank /></Suspense>;
}
