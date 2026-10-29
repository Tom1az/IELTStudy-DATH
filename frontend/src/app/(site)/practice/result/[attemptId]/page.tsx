"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight, BadgeCheck, ChevronDown, RotateCcw, Sparkles } from "lucide-react";
import { meApi, practiceApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { RequireRole } from "@/lib/auth-context";
import { SKILL_META, band, cx, fmtDate } from "@/lib/format";
import { ErrorState, PageLoader } from "@/components/ui";
import { QuestionView } from "@/components/quiz/QuestionView";
import { PassagePane } from "@/components/quiz/PassagePane";
import { RecommendationList, recHref } from "@/components/RecommendationList";

// Spec: a micro-skill below this mastery triggers remedial recommendations
const THRESHOLD = 0.65;

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Accuracy ring (Figma "Practice result"): a blue arc on a light track, the percentage in the middle. */
function AccuracyRing({ value }: { value: number }) {
  const size = 96;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  // The arc is a dashed circle: the dash covers `value` of the circumference, the gap the rest
  const dash = Math.max(0, Math.min(1, value)) * circumference;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-24 w-24 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F2F6FC" strokeWidth={stroke} />
        {/* At 0% a round line cap would still draw a dot, so the arc is left out */}
        {dash > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#3971B8" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${dash} ${circumference}`} />}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[20px] font-extrabold text-brand">{pct(value)}</span>
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
  const accuracy = attempt.totalScore / Math.max(1, attempt.maxScore);
  const resp = Object.fromEntries(attempt.responses.map((r) => [r.questionId, r]));
  // No mastery changes means skill tracking (BKT, Phase 3) isn't running yet
  const tracking = changes.length > 0;
  const hasPassages = sections.some((s) => s.passage.paragraphs.length > 0 || s.passage.kind === "listening");
  const top = recommendations.length > 0 ? recommendations[0] : null;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-6 md:py-8">
      <Link href="/my-learning" className="text-sm font-semibold text-ink-muted hover:text-ink">← Back to My learning</Link>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
        <div className="flex flex-col gap-4 lg:gap-6">
          {/* Score summary */}
          <section className="card flex flex-col gap-4 p-6" aria-labelledby="score-h">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-eyebrow text-ink-muted">{attempt.kind === "placement" ? "Placement quiz" : "Quiz"} · {SKILL_META[quiz.skill].label}</p>
              <BadgeCheck className="h-5 w-5 text-brand" aria-hidden />
            </div>
            <div className="flex items-center gap-5">
              <AccuracyRing value={accuracy} />
              <div className="min-w-0">
                <h1 id="score-h" className="text-[24px] leading-tight md:text-[28px]">You scored {attempt.totalScore} / {attempt.maxScore}</h1>
                <p className="mt-1.5 text-xs font-semibold">questions correct</p>
                <p className="mt-1.5 text-[12px] leading-normal text-ink-muted">{quiz.title}</p>
              </div>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-3 text-[11px] text-ink-muted">
              <span>Submitted {fmtDate(attempt.completedAt, true)}</span>
              {bands && <span>{SKILL_META[quiz.skill].label} estimate {band(bands[quiz.skill])} · Overall {band(data.overall)}</span>}
            </div>
          </section>

          {/* BKT mastery updates */}
          <section className="card flex flex-col gap-4 p-6" aria-labelledby="skills-h">
            <div className="flex items-baseline justify-between">
              <h2 id="skills-h" className="text-base">Your mastery update</h2>
              <span className="text-[10px] font-bold text-brand">BKT</span>
            </div>
            {tracking ? (
              <>
                <ul className="flex flex-col gap-4">
                  {changes.map((c) => {
                    const below = c.after < THRESHOLD;
                    return (
                      <li key={c.skillId} className="flex items-center gap-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-bold">{c.name}</p>
                          <p className="text-[11px] text-ink-muted">
                            {below ? "Needs review · below 65%" : c.after > c.before ? "Improving" : c.after < c.before ? "Dropped a little" : "Steady"}
                          </p>
                        </div>
                        <span className="text-xs tabular-nums text-ink-muted">{pct(c.before)}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
                        {/* Tea Green marks a skill under the 0.65 target, so it stands out from the blue ones */}
                        <span className={cx("rounded-lg px-2 py-1.5 text-xs font-extrabold tabular-nums", below ? "bg-tea text-ink" : "bg-brand-tint text-brand")}>{pct(c.after)}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-[11px] leading-normal text-ink-muted">Bayesian Knowledge Tracing updated each micro-skill tagged on these questions, from your answers, not just your score.</p>
              </>
            ) : (
              <p className="text-sm text-ink-muted">Skill tracking is not available yet, so this attempt didn&apos;t change your skill map.</p>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          {/* Targeted remedial recommendation */}
          <section className="flex flex-col gap-3 rounded-2xl bg-brand p-6 text-white" aria-labelledby="rec-h">
            <div className="flex items-center justify-between">
              <p id="rec-h" className="text-[10px] font-extrabold uppercase tracking-eyebrow">Your next best step</p>
              <Sparkles className="h-[18px] w-[18px]" aria-hidden />
            </div>
            {!tracking ? (
              <p className="text-sm text-white/90">Recommendations are not available yet.</p>
            ) : top ? (
              <>
                <p className="text-[21px] font-extrabold leading-tight">{top.title}</p>
                <p className="text-xs leading-relaxed text-white/90">{top.reason}</p>
                <Link href={recHref(top)} onClick={() => meApi.clickRecommendation(top.id).catch(() => {})} className="btn-light mt-1 h-11 w-full">
                  {top.kind === "lesson" ? "Start remedial lesson" : "Start remedial practice"} <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <p className="text-sm text-white/90">Every skill in this quiz is above the 0.65 target. Keep moving through your path.</p>
            )}
          </section>

          {recommendations.length > 1 && (
            <section className="card p-5">
              <h2 className="text-sm">More for your weak skills</h2>
              <div className="mt-3"><RecommendationList items={recommendations.slice(1)} /></div>
            </section>
          )}

          <div className="card flex flex-col gap-2.5 p-5">
            {/* The diagnostic can only be taken once */}
            {attempt.kind !== "placement" && <Link href={`/practice/${quiz.id}`} className="btn-outline w-full"><RotateCcw className="h-4 w-4" /> Retake this quiz</Link>}
            <Link href="/my-learning" className="btn-ghost w-full">Go to My learning</Link>
          </div>
        </aside>
      </div>

      <section className="mt-8" aria-labelledby="review-h">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="review-h" className="text-[22px]">Answer review</h2>
          {hasPassages && (
            <button className="flex items-center gap-1 text-sm font-bold text-brand" onClick={() => setShowPassage((s) => !s)} aria-expanded={showPassage}>
              {showPassage ? "Hide" : "Show"} passages and transcripts <ChevronDown className={cx("h-4 w-4 transition-transform", showPassage && "rotate-180")} />
            </button>
          )}
        </div>
        {showPassage && sections.map((s) => <div key={s.id} className="card mt-4 p-6"><PassagePane passage={s.passage} revealScript /></div>)}
        <div className="card mt-4 space-y-8 p-6">
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
