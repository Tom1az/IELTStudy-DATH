"use client";

import { useState } from "react";
import { Check, ClipboardCheck, PenLine, X } from "lucide-react";
import { gradingApi } from "@/lib/api";
import type { Submission } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { cx, fmtDate, timeAgo } from "@/lib/format";
import { Avatar, EmptyState, ErrorState, Modal, PageHeader, PageLoader, Pagination, Select, Skeleton, Spinner, StatusPill, TextArea, useToast } from "@/components/ui";
import { NotAvailable } from "@/components/NotAvailable";

/**
 * The grading queue. Learners' quizzes are marked automatically, so an instructor is here
 * to do the two things a marker can't: write a comment, and correct a score the automatic
 * marking got wrong (a gap-fill spelling it wouldn't accept, for example).
 */

function ScoreCell({ s }: { s: Submission }) {
  const changed = s.graded && s.score !== s.autoScore;
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className={cx("font-extrabold", changed && "text-brand")}>{s.score}</span>
      <span className="text-ink-muted"> / {s.maxScore}</span>
      {changed && <span className="ml-1.5 text-xs text-ink-soft line-through">{s.autoScore}</span>}
    </span>
  );
}

/** One submission opened for marking: the answers on the left, the instructor's note below. */
function SubmissionDialog({ attemptId, onClose, onSaved }: { attemptId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data, error, loading } = useAsync(() => gradingApi.submission(attemptId), [attemptId]);
  const [comment, setComment] = useState<string | null>(null);
  const [score, setScore] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The fields start from what is already saved, then follow what the instructor types
  const commentValue = comment ?? data?.feedback?.comment ?? "";
  const scoreValue = score ?? (data?.feedback?.score ?? data?.submission.autoScore ?? 0).toString();
  const max = data?.submission.maxScore ?? 0;
  const parsedScore = Number(scoreValue);
  const scoreValid = Number.isInteger(parsedScore) && parsedScore >= 0 && parsedScore <= max;

  const save = async () => {
    if (!data || !scoreValid) return;
    setSaving(true);
    try {
      // Only send a score when it differs from the automatic one; otherwise keep that
      await gradingApi.saveFeedback(attemptId, {
        comment: commentValue,
        score: parsedScore === data.submission.autoScore ? null : parsedScore,
      });
      toast("Feedback sent to the learner.");
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={data ? `${data.submission.learner.name} · ${data.submission.quiz.title}` : "Submission"}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={save} disabled={!data || saving || !scoreValid}>
            {saving && <Spinner className="h-4 w-4" />}Save feedback
          </button>
        </>
      }
    >
      {loading && !data ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : error ? (
        <ErrorState error={error} />
      ) : !data ? (
        <p className="text-sm text-ink-muted">This submission could not be loaded.</p>
      ) : (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-ivory p-4 text-sm sm:grid-cols-4">
            <div><dt className="eyebrow-muted">Course</dt><dd className="mt-1 font-semibold">{data.submission.course.title}</dd></div>
            <div><dt className="eyebrow-muted">Submitted</dt><dd className="mt-1 font-semibold">{fmtDate(data.submission.submittedAt, true)}</dd></div>
            <div><dt className="eyebrow-muted">Marked</dt><dd className="mt-1 font-semibold tabular-nums">{data.submission.autoScore} / {data.submission.maxScore}</dd></div>
            <div><dt className="eyebrow-muted">Status</dt><dd className="mt-1">{data.feedback ? <StatusPill tone="green">Graded</StatusPill> : <StatusPill tone="amber">Waiting</StatusPill>}</dd></div>
          </dl>

          <section aria-labelledby="answers-h">
            <h3 id="answers-h" className="mb-3 text-sm font-extrabold">Answers</h3>
            <ol className="space-y-2">
              {data.answers.map((a) => (
                <li key={a.questionId} className={cx("rounded-xl border p-3.5 transition-colors", a.isCorrect ? "border-line bg-white" : "border-danger/25 bg-danger-tint/40")}>
                  <div className="flex items-start gap-2.5">
                    <span className={cx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white", a.isCorrect ? "bg-brand" : "bg-danger")}>
                      {a.isCorrect ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{a.number}. {a.prompt}</p>
                      <p className="mt-1.5 text-sm">
                        <span className="text-ink-muted">Answered: </span>
                        <span className="font-semibold">{a.given || <em className="font-normal text-ink-soft">left blank</em>}</span>
                      </p>
                      {!a.isCorrect && <p className="text-sm"><span className="text-ink-muted">Expected: </span><span className="font-semibold">{a.expected}</span></p>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-4 border-t border-line pt-5" aria-labelledby="feedback-h">
            <h3 id="feedback-h" className="text-sm font-extrabold">Your feedback</h3>
            <TextArea
              label="Comment for the learner"
              placeholder="What went well, and the one thing to work on next."
              value={commentValue}
              onChange={(e) => setComment(e.target.value)}
              hint="The learner reads this on their result page."
            />
            <div className="flex flex-wrap items-end gap-3">
              <label className="w-40">
                <span className="label">Final score</span>
                <input
                  className={cx("input tabular-nums", !scoreValid && "border-danger focus:border-danger focus:ring-danger/15")}
                  type="number"
                  min={0}
                  max={max}
                  step={1}
                  value={scoreValue}
                  onChange={(e) => setScore(e.target.value)}
                  aria-invalid={!scoreValid}
                />
              </label>
              <span className="pb-3 text-sm text-ink-muted">out of {max}</span>
              {parsedScore !== data.submission.autoScore && (
                <button type="button" className="btn-ghost btn-sm mb-2" onClick={() => setScore(String(data.submission.autoScore))}>
                  Back to the marked score
                </button>
              )}
            </div>
            {!scoreValid && <p className="text-xs font-medium text-danger">Enter a whole number between 0 and {max}.</p>}
          </section>
        </div>
      )}
    </Modal>
  );
}

export default function GradingPage() {
  const [courseId, setCourseId] = useState("all");
  const [quizId, setQuizId] = useState("all");
  const [onlyUngraded, setOnlyUngraded] = useState(true);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync(() => gradingApi.queue({ courseId, quizId, onlyUngraded, page }), [courseId, quizId, onlyUngraded, page]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <PageLoader label="Loading submissions…" />;
  if (!data) {
    return (
      <NotAvailable eyebrow="Instructor studio" title="Grading">
        The backend has no grading queue yet. This page starts working as soon as <code>GET /instructor/submissions</code> answers.
      </NotAvailable>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Instructor studio" title="Grading">
        Quizzes are marked automatically. Use this page to leave a comment, and to correct a score where the automatic marking was too strict.
      </PageHeader>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <Select value={courseId} onChange={(e) => { setCourseId(e.target.value); setQuizId("all"); setPage(1); }} aria-label="Course">
          <option value="all">All courses</option>
          {data.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select>
        <Select value={quizId} onChange={(e) => { setQuizId(e.target.value); setPage(1); }} aria-label="Quiz">
          <option value="all">All quizzes</option>
          {data.quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
        </Select>
        <label className="flex cursor-pointer select-none items-center gap-2.5 rounded-lg border border-line bg-white px-4 text-sm font-semibold transition-colors hover:border-brand/40">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={onlyUngraded} onChange={(e) => { setOnlyUngraded(e.target.checked); setPage(1); }} />
          Waiting for feedback
        </label>
      </div>

      <div className={cx("overflow-x-auto rounded-2xl border border-line bg-white transition-opacity duration-200", loading && "opacity-60")}>
        {data.items.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title={onlyUngraded ? "Nothing waiting" : "No submissions yet"}>
            {onlyUngraded ? "Every submission that matches these filters already has your feedback." : "Submissions appear here as soon as a learner finishes one of your quizzes."}
          </EmptyState>
        ) : (
          <table className="table-base min-w-[760px]">
            <thead><tr><th>Learner</th><th>Quiz</th><th>Score</th><th>Submitted</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.attemptId}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={s.learner.name} size={34} />
                      <div className="min-w-0"><p className="truncate font-semibold">{s.learner.name}</p><p className="truncate text-xs text-ink-muted">{s.learner.email}</p></div>
                    </div>
                  </td>
                  <td><p className="font-semibold">{s.quiz.title}</p><p className="text-xs text-ink-muted">{s.course.title}</p></td>
                  <td><ScoreCell s={s} /></td>
                  <td className="whitespace-nowrap text-ink-muted" title={fmtDate(s.submittedAt, true)}>{timeAgo(s.submittedAt)}</td>
                  <td>{s.graded ? <StatusPill tone="green">Graded</StatusPill> : <StatusPill tone="amber">Waiting</StatusPill>}</td>
                  <td className="text-right">
                    <button className="btn-outline btn-sm" onClick={() => setOpen(s.attemptId)}>
                      <PenLine className="h-3.5 w-3.5" />{s.graded ? "Edit" : "Grade"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-muted">{data.total} {data.total === 1 ? "submission" : "submissions"}</p>
        <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
      </div>

      {open && <SubmissionDialog attemptId={open} onClose={() => setOpen(null)} onSaved={() => reload(true)} />}
    </div>
  );
}
