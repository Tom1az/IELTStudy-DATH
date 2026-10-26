"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { catalogApi, instructorApi } from "@/lib/api";
import type { BackendQuestionType } from "@/lib/api/backend-types";
import { SKILL_CATEGORIES } from "@/lib/types";
import { useAsync, useDebounced } from "@/lib/hooks";
import { SKILL_META } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, PageLoader, Pagination, Select } from "@/components/ui";

const TYPE_LABEL: Record<BackendQuestionType, string> = {
  multiple_choice: "Multiple choice",
  error_identification: "Error identification",
  true_false_not_given: "T/F/NG",
  gap_fill: "Gap fill",
  matching: "Matching",
};

/** Real backend: my questions (all questions for admins), filtered by skill and type. Edit them inside their lesson. */
export function QuestionBank() {
  const [q, setQ] = useState("");
  const [skillId, setSkillId] = useState("");
  const [type, setType] = useState<BackendQuestionType | "">("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q).trim().toLowerCase();
  const skills = useAsync(() => catalogApi.skills(), []).data ?? [];
  const { data, error, loading, reload } = useAsync(() => instructorApi.listQuestions({ skillId: skillId || undefined, type: type || undefined }), [skillId, type]);
  const per = 15;
  // The API filters by skill and type; the text search runs here
  const rows = (data ?? []).filter((x) => !dq || x.questionText.toLowerCase().includes(dq));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Instructor studio" title="Question bank">Every question you have written, with its Q-matrix tags. To edit a question, open the lesson whose quiz uses it.</PageHeader>
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px_240px]">
        <label className="relative"><span className="sr-only">Search questions</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" /><input className="input pl-9" placeholder="Search question text" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
        <Select value={type} onChange={(e) => { setType(e.target.value as BackendQuestionType | ""); setPage(1); }} aria-label="Question type">
          <option value="">All types</option>
          {(Object.keys(TYPE_LABEL) as BackendQuestionType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </Select>
        <Select value={skillId} onChange={(e) => { setSkillId(e.target.value); setPage(1); }} aria-label="Micro-skill">
          <option value="">All micro-skills</option>
          {SKILL_CATEGORIES.map((c) => <optgroup key={c} label={SKILL_META[c].label}>{skills.filter((s) => s.category === c).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
        </Select>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <PageLoader /> : (
        <>
          <p className="mb-2 text-sm text-ink-muted">{rows.length} questions</p>
          <div className="overflow-x-auto rounded-2xl border border-line bg-white">
            {rows.length === 0 ? <EmptyState title="No questions match" /> : (
              <table className="table-base min-w-[760px]">
                <thead><tr><th>Question</th><th>Type</th><th>Skills (weight)</th><th>Difficulty</th></tr></thead>
                <tbody>
                  {rows.slice((page - 1) * per, page * per).map((x) => (
                    <tr key={x.questionId}>
                      <td className="max-w-[380px]"><p className="line-clamp-2 text-sm">{x.questionText}</p></td>
                      <td className="text-xs">{TYPE_LABEL[x.questionType]}</td>
                      <td className="text-xs">{x.skills.map((s) => <span key={s.skillId} className="mb-1 mr-1 inline-block rounded bg-teal-tint px-1.5 py-0.5 text-teal-ink">{s.name} {s.weight}</span>)}</td>
                      <td>{x.difficulty}</td>
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
