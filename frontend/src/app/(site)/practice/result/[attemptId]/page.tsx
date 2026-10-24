"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ArrowRight, ChevronDown, Flag, RotateCcw, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { practiceApi } from "@/lib/api";
import type { Question } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { RequireRole } from "@/lib/auth-context";
import { SKILL_META, band, cx, fmtDate } from "@/lib/format";
import { ErrorState, PageLoader } from "@/components/ui";
import { QuestionView } from "@/components/quiz/QuestionView";
import { PassagePane } from "@/components/quiz/PassagePane";
import { RecommendationList } from "@/components/RecommendationList";
import { ReportDialog } from "@/components/ReportDialog";

const THRESHOLD = 0.65;

function MasteryBar({ before, after }: { before: number; after: number }) {
  const up = after >= before;
  return (
    <div className="relative h-2.5 w-full rounded-full bg-sand" aria-hidden>
      <div className="absolute inset-y-0 left-0 rounded-full bg-navy-300" style={{ width: `${Math.min(before, after) * 100}%` }} />
      <div className={cx("absolute inset-y-0 rounded-full", up ? "bg-teal" : "bg-brand")} style={{ left: `${Math.min(before, after) * 100}%`, width: `${Math.abs(after - before) * 100}%` }} />
      <div className="absolute -top-1 h-[18px] w-0.5 bg-ink" style={{ left: `${THRESHOLD * 100}%` }} title="Mastery threshold 0.65" />
    </div>
  );
}

function ResultInner() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { data, error, loading, reload } = useAsync(() => practiceApi.result(attemptId), [attemptId]);
  const [showPassage, setShowPassage] = useState(false);
  const [reportQ, setReportQ] = useState<Question | null>(null);

  if (loading && !data) return <PageLoader label="Scoring your answers…" />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;

  const { attempt, set, course, changes, bands, recommendations, gate, nextLesson } = data;
  const pctScore = Math.round((attempt.totalScore / Math.max(1, attempt.maxScore)) * 100);
  const resp = Object.fromEntries(attempt.responses.map((r) => [r.questionId, r]));
  const lessonHref = course && set.lessonId ? `/learn/${course.slug}/${set.lessonId}` : "/my-learning";

  return (
    <div className="container max-w-[1100px] py-10">
      <Link href={lessonHref} className="text-sm font-semibold text-ink-muted hover:text-ink">← Back to lesson</Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <p className="eyebrow">Practice set {set.code} · {SKILL_META[set.skill].label}{course ? ` · ${course.levelName}` : ""}</p>
          <h1 className="mt-2 font-serif text-[34px] font-bold leading-tight md:text-[40px]">You scored {attempt.totalScore} / {attempt.maxScore}</h1>
          <p className="mt-1 text-ink-muted">{set.title} · Submitted {fmtDate(attempt.completedAt, true)}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <p className="eyebrow-muted">Accuracy</p>
              <p className={cx("mt-1 font-serif text-3xl font-bold", pctScore >= 70 ? "text-teal" : pctScore >= 50 ? "text-skill-r" : "text-brand")}>{pctScore}%</p>
            </div>
            <div className="card p-4">
              <p className="eyebrow-muted">{SKILL_META[set.skill].label} estimate</p>
              <p className="mt-1 font-serif text-3xl font-bold">{band(bands[set.skill])}</p>
            </div>
            <div className="card p-4">
              <p className="eyebrow-muted">Overall estimate</p>
              <p className="mt-1 font-serif text-3xl font-bold">{band(data.overall)}</p>
            </div>
          </div>

          {gate && (
            <div className="mt-6 flex gap-3 rounded-2xl border border-skill-r/40 bg-skill-r-bg p-5 text-skill-r-ink">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Review before “{gate.beforeLessonTitle}”</p>
                <p className="mt-1 text-sm">Your mastery of {gate.skillName} is below 0.65, so the next lesson is gated until you complete one of the recommended reviews or your mastery recovers. You can still choose to continue from the lesson page.</p>
              </div>
            </div>
          )}

          <section className="mt-8" aria-labelledby="skills-h">
            <h2 id="skills-h" className="font-serif text-2xl font-bold">How your skills changed</h2>
            <p className="mt-1 text-sm text-ink-muted">Bayesian Knowledge Tracing updated each micro-skill tagged on these questions. The black line is the 0.65 mastery target.</p>
            <ul className="mt-4 space-y-3">
              {changes.map((c) => {
                const d = c.after - c.before;
                return (
                  <li key={c.skillId} className="card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{c.name} <span className="ml-1 text-xs font-normal text-ink-soft">{c.skillId}</span></p>
                      <p className={cx("flex items-center gap-1 whitespace-nowrap text-sm font-semibold tabular-nums", d >= 0 ? "text-teal" : "text-brand")}>
                        {d >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        {c.before.toFixed(2)} → {c.after.toFixed(2)}
                      </p>
                    </div>
                    <div className="mt-2.5"><MasteryBar before={c.before} after={c.after} /></div>
                    <p className="mt-1.5 text-xs text-ink-muted">{c.after >= THRESHOLD ? "Mastered — above target." : `${(THRESHOLD - c.after).toFixed(2)} below target.`}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl bg-navy p-5 text-white">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-eyebrow text-brand-soft"><Sparkles className="h-3.5 w-3.5" /> Targeted next steps</p>
            {recommendations.length ? (
              <>
                <p className="mt-2 text-sm text-white/85">Picked from lessons tagged with your weakest skills from this set.</p>
                <div className="mt-4 text-ink"><RecommendationList items={recommendations} /></div>
                <p className="mt-3 text-[11px] text-white/60">Re-ranked in {data.recLatencyMs.toFixed(1)} ms · BKT + content-based filtering</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-white/85">Every skill in this set is above the 0.65 target. Keep moving through your path.</p>
            )}
          </div>
          <div className="card space-y-2.5 p-5">
            {nextLesson && <Link href={`/learn/${nextLesson.courseSlug}/${nextLesson.id}`} className="btn-primary w-full">Next: {nextLesson.title} <ArrowRight className="h-4 w-4" /></Link>}
            <Link href={`/practice/${set.id}`} className="btn-outline w-full"><RotateCcw className="h-4 w-4" /> Retake this set</Link>
            <Link href="/my-learning" className="btn-ghost w-full">Go to My learning</Link>
          </div>
        </aside>
      </div>

      <section className="mt-12" aria-labelledby="review-h">
        <div className="flex items-end justify-between gap-4">
          <h2 id="review-h" className="font-serif text-2xl font-bold">Answer review</h2>
          <button className="flex items-center gap-1 text-sm font-semibold text-brand" onClick={() => setShowPassage((s) => !s)} aria-expanded={showPassage}>
            {showPassage ? "Hide" : "Show"} {set.passage.kind === "listening" ? "transcript" : "passage"} <ChevronDown className={cx("h-4 w-4 transition-transform", showPassage && "rotate-180")} />
          </button>
        </div>
        {showPassage && <div className="card mt-4 p-6"><PassagePane passage={set.passage} revealScript /></div>}
        <div className="card mt-4 space-y-7 p-6">
          {set.questions.map((q, i) => (
            <div key={q.id}>
              {q.groupLabel && <h3 className="mb-3 font-serif text-lg font-bold">{q.groupLabel}</h3>}
              <QuestionView q={q} number={i + 1} value={resp[q.id]?.userAnswer ?? ""} review={{ isCorrect: !!resp[q.id]?.isCorrect, answerKey: q.answerKey, explanation: q.explanation }} />
              <button className="ml-8 mt-2 flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-danger" onClick={() => setReportQ(q)}><Flag className="h-3 w-3" /> Report this question</button>
            </div>
          ))}
        </div>
      </section>
      <ReportDialog open={!!reportQ} onClose={() => setReportQ(null)} targetType="question" targetId={reportQ?.id ?? ""} targetPreview={reportQ?.prompt ?? ""} />
    </div>
  );
}

export default function ResultPage() {
  return (
    <RequireRole roles={["learner", "instructor", "admin"]}>
      <ResultInner />
    </RequireRole>
  );
}
