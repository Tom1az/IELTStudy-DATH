"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp, Paperclip, X } from "lucide-react";
import { meApi, ApiError } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { RequireRole } from "@/lib/auth-context";
import { band, dueIn, fmtDate } from "@/lib/format";
import { Alert, ErrorState, PageLoader, Spinner, StatusPill, useToast } from "@/components/ui";

const ACCEPT = ".txt,.md,.doc,.docx,.pdf";

function AssignmentInner() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => meApi.assignment(id), [id]);
  const [text, setText] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const { assignment: a, course, lesson, submission } = data;
  const body = text ?? submission?.text ?? "";
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const overdue = Date.parse(a.dueAt) < Date.now();

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return setErrs({ fileSize: "Files must be 10 MB or smaller." });
    setErrs({});
    setFile(f);
    if (/\.(txt|md)$/i.test(f.name)) setText(await f.text());
  };

  const submit = async () => {
    setPending(true);
    setErrs({});
    try {
      await meApi.submitAssignment(a.id, { text: body, fileName: file?.name ?? submission?.fileName, fileSize: file?.size ?? submission?.fileSize });
      toast("Submitted. Your instructor has been notified.");
      setFile(null);
      setText(null);
      reload(true);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrs(e.fields); else toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="container max-w-5xl pb-16 pt-10">
      <Link href={`/learn/${course.slug}/${lesson.id}`} className="text-sm font-semibold text-ink-muted hover:text-ink">← {lesson.title}</Link>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusPill tone="red">Writing {a.task}</StatusPill>
        <span className="text-sm text-ink-muted">{course.title} · Due {fmtDate(a.dueAt, true)} · {dueIn(a.dueAt)}</span>
      </div>
      <h1 className="mt-2 font-serif text-[32px] font-bold leading-tight">{a.title}</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card p-6">
            <p className="eyebrow-muted">Task</p>
            <p className="mt-2 text-[15px] leading-relaxed">{a.prompt}</p>
            <p className="mt-3 text-xs text-ink-muted">Minimum {a.minWords} words · Graded out of Band 9 against the four official criteria.</p>
          </section>

          {submission?.status === "graded" ? (
            <section className="card p-6">
              <div className="flex items-center justify-between"><h2 className="font-serif text-xl font-bold">Your result</h2><span className="font-serif text-3xl font-bold">Band {band(submission.band)}</span></div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {Object.entries(submission.scores ?? {}).map(([k, v]) => <li key={k} className="flex justify-between rounded-lg bg-cream px-3 py-2 text-sm"><span>{k}</span><strong>{band(v)}</strong></li>)}
              </ul>
              <div className="mt-4 rounded-xl border border-line p-4"><p className="eyebrow-muted">Instructor feedback</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{submission.feedback}</p><p className="mt-2 text-xs text-ink-soft">Graded {fmtDate(submission.gradedAt, true)}</p></div>
              <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-brand">Show my submission</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{submission.text}</p></details>
            </section>
          ) : (
            <section className="card p-6">
              <h2 className="font-serif text-xl font-bold">{submission ? "Update your submission" : "Your answer"}</h2>
              {submission && <Alert tone="success" className="mt-3">Submitted {fmtDate(submission.submittedAt, true)}{submission.late ? " (late)" : ""}. You can resubmit until it is graded.</Alert>}
              {overdue && !submission && <Alert tone="warn" className="mt-3">The due date has passed. Late submissions are accepted and marked as late.</Alert>}
              <label htmlFor="essay" className="label mt-4">Type or paste your answer</label>
              <textarea id="essay" value={body} onChange={(e) => setText(e.target.value)} className="input min-h-[280px] leading-relaxed" placeholder="Start writing…" />
              <p className={words >= a.minWords ? "mt-1.5 text-xs text-teal" : "mt-1.5 text-xs text-ink-muted"}>{words} words{words < a.minWords ? ` · ${a.minWords - words} more to reach the minimum` : " · minimum reached"}</p>
              {errs.text && <p className="mt-1 text-xs font-medium text-danger">{errs.text}</p>}

              <div className="mt-5">
                <p className="label">Or attach a file</p>
                <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" id="file" onChange={(e) => pick(e.target.files?.[0])} />
                {file || submission?.fileName ? (
                  <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-sm">
                    <Paperclip className="h-4 w-4 text-ink-muted" />
                    <span className="flex-1 truncate">{file?.name ?? submission?.fileName}</span>
                    <span className="text-xs text-ink-soft">{Math.round((file?.size ?? submission?.fileSize ?? 0) / 1024)} KB</span>
                    {file && <button onClick={() => setFile(null)} aria-label="Remove file"><X className="h-4 w-4" /></button>}
                  </div>
                ) : (
                  <label htmlFor="file" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
                    className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-[#C9BFA9] px-4 py-6 text-center text-sm text-ink-muted hover:border-navy">
                    <FileUp className="h-6 w-6" />
                    <span><strong className="text-ink">Choose a file</strong> or drag it here</span>
                    <span className="text-xs">.docx, .pdf, .txt or .md · up to 10 MB</span>
                  </label>
                )}
                {errs.fileSize && <p className="mt-1 text-xs font-medium text-danger">{errs.fileSize}</p>}
              </div>
              <button className="btn-primary mt-6" onClick={submit} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}{submission ? "Resubmit" : "Submit for grading"}</button>
            </section>
          )}
        </div>

        <aside className="card self-start p-5">
          <p className="eyebrow-muted">Marking criteria</p>
          <ul className="mt-3 space-y-3">
            {a.rubric.map((r) => <li key={r.criterion}><p className="text-sm font-semibold">{r.criterion}</p><p className="text-xs text-ink-muted">{r.description}</p></li>)}
          </ul>
        </aside>
      </div>
    </div>
  );
}

export default function AssignmentPage() {
  return <RequireRole><AssignmentInner /></RequireRole>;
}
