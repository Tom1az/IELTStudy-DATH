"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ChevronDown, RotateCcw, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { practiceApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { RequireRole } from "@/lib/auth-context";
import { SKILL_META, band, cx, fmtDate } from "@/lib/format";
import { ErrorState, PageLoader } from "@/components/ui";
import { QuestionView } from "@/components/quiz/QuestionView";
import { PassagePane } from "@/components/quiz/PassagePane";
import { RecommendationList } from "@/components/RecommendationList";

// Spec: a micro-skill below this mastery triggers remedial recommendations
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

/** The post-quiz review screen (spec: key screen). */
function ResultInner() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { data, error, loading, reload } = useAsync(() => practiceApi.result(attemptId), [attemptId]);
  const [showPassage, setShowPassage] = useState(false);

  if (loading && !data) return <PageLoader label="Loading your result…" />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;

  const { attempt, quiz, sections, changes, bands, recommendations } = data;
  const questions = sections.flatMap((s) => s.questions);
  const pctScore = Math.round((attempt.totalScore / Math.max(1, attempt.maxScore)) * 100);
  const resp = Object.fromEntries(attempt.responses.map((r) => [r.questionId, r]));
  // No mastery changes means skill tracking (BKT, Phase 3) isn't running yet
  const tracking = changes.length > 0;
  const hasPassages = sections.some((s) => s.passage.paragraphs.length > 0 || s.passage.kind === "listening");

  return (
    <div className="container max-w-[1100px] py-10">
      <Link href="/my-learning" className="text-sm font-semibold text-ink-muted hover:text-ink">← Back to My learning</Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <p className="eyebrow">{attempt.kind === "placement" ? "Placement quiz" : "Quiz"} · {SKILL_META[quiz.skill].label}</p>
          <h1 className="mt-2 font-serif text-[34px] font-bold leading-tight md:text-[40px]">You scored {attempt.totalScore} / {attempt.maxScore}</h1>
          <p className="mt-1 text-ink-muted">{quiz.title} · Submitted {fmtDate(attempt.completedAt, true)}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <p className="eyebrow-muted">Accuracy</p>
              <p className={cx("mt-1 font-serif text-3xl font-bold", pctScore >= 70 ? "text-teal" : pctScore >= 50 ? "text-skill-r" : "text-brand")}>{pctScore}%</p>
            </div>
            {bands && (
              <>
                <div className="card p-4">
                  <p className="eyebrow-muted">{SKILL_META[quiz.skill].label} estimate</p>
                  <p className="mt-1 font-serif text-3xl font-bold">{band(bands[quiz.skill])}</p>
                </div>
                <div className="card p-4">
                  <p className="eyebrow-muted">Overall estimate</p>
                  <p className="mt-1 font-serif text-3xl font-bold">{band(data.overall)}</p>
                </div>
              </>
            )}
          </div>

          <section className="mt-8" aria-labelledby="skills-h">
            <h2 id="skills-h" className="font-serif text-2xl font-bold">How your skills changed</h2>
            {tracking ? (
              <p className="mt-1 text-sm text-ink-muted">Bayesian Knowledge Tracing updated each micro-skill tagged on these questions. The black line is the 0.65 mastery target.</p>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">Skill tracking is not available yet, so this attempt didn&apos;t change your skill map.</p>
            )}
            <ul className="mt-4 space-y-3">
              {changes.map((c) => {
                const d = c.after - c.before;
                return (
                  <li key={c.skillId} className="card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{c.name}</p>
                      <p className={cx("flex items-center gap-1 whitespace-nowrap text-sm font-semibold tabular-nums", d >= 0 ? "text-teal" : "text-brand")}>
                        {d >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        {c.before.toFixed(2)} → {c.after.toFixed(2)}
                      </p>
                    </div>
                    <div className="mt-2.5"><MasteryBar before={c.before} after={c.after} /></div>
                    <p className="mt-1.5 text-xs text-ink-muted">{c.after >= THRESHOLD ? "Mastered: above target." : `${(THRESHOLD - c.after).toFixed(2)} below target.`}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl bg-navy p-5 text-white">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-eyebrow text-brand-soft"><Sparkles className="h-3.5 w-3.5" /> Targeted next steps</p>
            {!tracking ? (
              <p className="mt-2 text-sm text-white/85">Recommendations are not available yet.</p>
            ) : recommendations.length ? (
              <>
                <p className="mt-2 text-sm text-white/85">Picked from lessons tagged with your weakest skills.</p>
                <div className="mt-4 text-ink"><RecommendationList items={recommendations} /></div>
              </>
            ) : (
              <p className="mt-2 text-sm text-white/85">Every skill in this quiz is above the 0.65 target. Keep moving through your path.</p>
            )}
          </div>
          <div className="card space-y-2.5 p-5">
            {/* The diagnostic can only be taken once */}
            {attempt.kind !== "placement" && <Link href={`/practice/${quiz.id}`} className="btn-outline w-full"><RotateCcw className="h-4 w-4" /> Retake this quiz</Link>}
            <Link href="/my-learning" className="btn-ghost w-full">Go to My learning</Link>
          </div>
        </aside>
      </div>

      <section className="mt-12" aria-labelledby="review-h">
        <div className="flex items-end justify-between gap-4">
          <h2 id="review-h" className="font-serif text-2xl font-bold">Answer review</h2>
          {hasPassages && (
            <button className="flex items-center gap-1 text-sm font-semibold text-brand" onClick={() => setShowPassage((s) => !s)} aria-expanded={showPassage}>
              {showPassage ? "Hide" : "Show"} passages and transcripts <ChevronDown className={cx("h-4 w-4 transition-transform", showPassage && "rotate-180")} />
            </button>
          )}
        </div>
        {showPassage && sections.map((s) => <div key={s.id} className="card mt-4 p-6"><PassagePane passage={s.passage} revealScript /></div>)}
        <div className="card mt-4 space-y-7 p-6">
          {questions.map((q, i) => (
            <QuestionView key={q.id} q={q} number={i + 1} value={resp[q.id]?.userAnswer ?? ""} review={{ isCorrect: !!resp[q.id]?.isCorrect, answerKey: q.answerKey, explanation: q.explanation }} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default function ResultPage() {
  return (
    <RequireRole roles={["learner", "admin"]}>
      <ResultInner />
    </RequireRole>
  );
}
