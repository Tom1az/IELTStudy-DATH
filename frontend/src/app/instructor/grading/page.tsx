"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Paperclip } from "lucide-react";
import { instructorApi, ApiError } from "@/lib/api";
import type { Assignment, Submission } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { overallBand } from "@/lib/adaptive/bkt";
import { band, fmtDate, timeAgo } from "@/lib/format";
import { EmptyState, ErrorState, Modal, PageHeader, PageLoader, Spinner, StatusPill, Tabs, TextArea, useToast } from "@/components/ui";

type Row = Submission & { assignment: Assignment; courseTitle: string };
const SCORES = Array.from({ length: 19 }, (_, i) => i / 2);

function GradeModal({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [scores, setScores] = useState<Record<string, number>>(row.scores ?? {});
  const [feedback, setFeedback] = useState(row.feedback ?? "");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const complete = row.assignment.rubric.every((r) => scores[r.criterion] !== undefined);
  const save = async () => {
    setPending(true);
    setErrs({});
    try {
      await instructorApi.grade(row.id, scores, feedback);
      toast(`Graded ${row.userName}. They've been notified.`);
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrs(e.fields); else toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} wide title={`${row.userName} · ${row.assignment.title}`} footer={<><span className="mr-auto self-center text-sm">Overall: <strong className="font-serif text-lg">{complete ? band(overallBand(Object.values(scores))) : "—"}</strong></span><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}{row.status === "graded" ? "Update grade" : "Submit grade"}</button></>}>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="text-xs text-ink-muted">{row.wordCount} words (minimum {row.assignment.minWords}) · submitted {fmtDate(row.submittedAt, true)}{row.late && " · late"}</p>
          {row.fileName && <p className="mt-2 flex items-center gap-1.5 text-sm"><Paperclip className="h-4 w-4" /> {row.fileName} <span className="text-xs text-ink-soft">{Math.round((row.fileSize ?? 0) / 1024)} KB</span></p>}
          <div className="mt-3 max-h-[52vh] overflow-y-auto whitespace-pre-wrap rounded-xl bg-cream p-4 text-[15px] leading-relaxed">{row.text || "No text pasted — see the attached file."}</div>
          <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-brand">Task prompt</summary><p className="mt-2 text-ink-muted">{row.assignment.prompt}</p></details>
        </div>
        <div className="space-y-4">
          {row.assignment.rubric.map((r) => (
            <label key={r.criterion} className="block">
              <span className="flex items-center justify-between text-sm font-semibold">{r.criterion}
                <select className="input h-9 w-24 py-1" value={scores[r.criterion] ?? ""} onChange={(e) => setScores({ ...scores, [r.criterion]: Number(e.target.value) })}>
                  <option value="" disabled>Band</option>
                  {SCORES.map((s) => <option key={s} value={s}>{s.toFixed(1)}</option>)}
                </select>
              </span>
              <span className="mt-1 block text-xs text-ink-muted">{r.description}</span>
            </label>
          ))}
          {errs.scores && <p className="text-xs font-medium text-danger">{errs.scores}</p>}
          <TextArea label="Feedback for the learner" value={feedback} onChange={(e) => setFeedback(e.target.value)} error={errs.feedback} className="min-h-[140px]" placeholder="What worked, what to fix first, and one concrete next step." />
        </div>
      </div>
    </Modal>
  );
}

function Grading() {
  const sp = useSearchParams();
  const assignmentId = sp.get("assignment") ?? undefined;
  const [tab, setTab] = useState<"submitted" | "graded">("submitted");
  const [open, setOpen] = useState<Row | null>(null);
  const { data, error, loading, reload } = useAsync(() => instructorApi.submissions({ assignmentId }), [assignmentId]);
  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const rows = data.filter((r) => r.status === tab);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Instructor studio" title="Grading">Writing submissions are graded on the four official criteria; the overall band uses IELTS rounding.</PageHeader>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "submitted", label: `To grade (${data.filter((r) => r.status === "submitted").length})` }, { id: "graded", label: `Graded (${data.filter((r) => r.status === "graded").length})` }]} />
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
        {rows.length === 0 ? <EmptyState title={tab === "submitted" ? "Nothing waiting for grading" : "No graded submissions yet"} /> : (
          <table className="table-base min-w-[760px]">
            <thead><tr><th>Learner</th><th>Task</th><th>Words</th><th>Submitted</th><th>{tab === "graded" ? "Band" : "Due"}</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.userName}</td>
                  <td><p className="text-sm">{r.assignment.title}</p><p className="text-xs text-ink-muted">{r.courseTitle} · {r.assignment.task}</p></td>
                  <td className={r.wordCount < r.assignment.minWords ? "text-brand" : ""}>{r.wordCount}</td>
                  <td className="text-ink-muted">{timeAgo(r.submittedAt)} {r.late && <StatusPill tone="red">Late</StatusPill>}</td>
                  <td>{tab === "graded" ? <strong>{band(r.band)}</strong> : <span className="text-ink-muted">{fmtDate(r.assignment.dueAt)}</span>}</td>
                  <td><button className={tab === "submitted" ? "btn-primary btn-sm" : "btn-outline btn-sm"} onClick={() => setOpen(r)}>{tab === "submitted" ? "Grade" : "Edit grade"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {open && <GradeModal row={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(true); }} />}
    </div>
  );
}

export default function GradingPage() {
  return <Suspense><Grading /></Suspense>;
}
