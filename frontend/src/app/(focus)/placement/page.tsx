"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, ChevronLeft, Clock, ListChecks, Sparkles } from "lucide-react";
import { practiceApi } from "@/lib/api";
import type { PlacementResult } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { RequireRole, useAuth } from "@/lib/auth-context";
import { LEVEL_THEME, SKILL_META, band, cx } from "@/lib/format";
import { SKILL_CATEGORIES } from "@/lib/types";
import { ErrorState, PageLoader, ProgressBar, useToast } from "@/components/ui";
import { SkillTile } from "@/components/SkillIcon";
import { QuizRunner } from "@/components/quiz/QuizRunner";
import { Logo } from "@/components/layout/Logo";

const LEVEL_NAME = { 1: "Foundation", 2: "Intermediate", 3: "Advanced" } as const;

function Placement() {
  const { data, error, loading, reload } = useAsync(() => practiceApi.placement(), []);
  const { refresh } = useAuth();
  const toast = useToast();
  const [stage, setStage] = useState<"intro" | "test" | "done">("intro");
  const [result, setResult] = useState<PlacementResult | null>(null);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;

  if (stage === "test") {
    return (
      <QuizRunner
        title={`Placement quiz · ${data.totalQuestions} questions`}
        sections={data.sections}
        initialSeconds={data.minutes * 60}
        allowUntimed={false}
        onExit={() => setStage("intro")}
        onSubmit={async (answers) => {
          try {
            const r = await practiceApi.submitPlacement(answers);
            setResult(r);
            setStage("done");
            await refresh();
          } catch (e) {
            toast((e as Error).message, "error");
          }
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-line">
        <div className="container flex h-[70px] items-center justify-between">
          <Logo />
          <Link href="/my-learning" className="flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink"><ChevronLeft className="h-4 w-4" /> My learning</Link>
        </div>
      </header>
      <div className="container max-w-3xl py-12">
        {stage === "intro" && (
          <>
            <p className="eyebrow">Placement quiz</p>
            <h1 className="mt-2 font-serif text-[36px] font-bold leading-tight md:text-[44px]">Find your starting level in 15 minutes</h1>
            <p className="mt-3 text-[17px] leading-relaxed text-ink-muted">
              {data.totalQuestions} objective questions across all four skills. Your answers set the starting point of your skill map, so recommendations are personal from your very first lesson.
            </p>
            {data.alreadyDone && <p className="mt-4 rounded-xl bg-skill-r-bg px-4 py-3 text-sm text-skill-r-ink">You&apos;ve taken the quiz before. Retaking it replaces your current skill map with a fresh estimate.</p>}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {data.sections.map((s) => (
                <div key={s.id} className="card flex items-center gap-4 p-4">
                  <SkillTile skill={s.skill} />
                  <div>
                    <p className="font-semibold">{SKILL_META[s.skill].label}</p>
                    <p className="text-xs text-ink-muted">{s.questions.length} questions · {s.passage.title}</p>
                  </div>
                </div>
              ))}
            </div>
            <ul className="mt-8 space-y-2.5 text-sm text-ink-muted">
              <li className="flex gap-2.5"><Clock className="h-4 w-4 text-brand" /> {data.minutes} minutes in total. Answers are submitted automatically when time runs out.</li>
              <li className="flex gap-2.5"><ListChecks className="h-4 w-4 text-brand" /> Move freely between sections with the tabs and the question numbers at the bottom.</li>
              <li className="flex gap-2.5"><Sparkles className="h-4 w-4 text-brand" /> Listening uses your device&apos;s speakers or headphones.</li>
            </ul>
            <button className="btn-primary mt-10 px-8 py-3 text-base" onClick={() => setStage("test")}>Start the quiz</button>
          </>
        )}

        {stage === "done" && result && (
          <>
            <p className="eyebrow">Your result</p>
            <h1 className="mt-2 font-serif text-[36px] font-bold leading-tight md:text-[44px]">Estimated Band {band(result.overall)}</h1>
            <p className="mt-2 text-ink-muted">Estimated bands are practice indicators, not official IELTS scores.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {SKILL_CATEGORIES.map((s) => (
                <div key={s} className="card p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{SKILL_META[s].label}</p>
                    <p className="font-serif text-2xl font-bold">{band(result.bands[s])}</p>
                  </div>
                  <div className="mt-2"><ProgressBar value={result.correctBySkill[s].correct} max={result.correctBySkill[s].total} color={SKILL_META[s].bar} /></div>
                  <p className="mt-1.5 text-xs text-ink-muted">{result.correctBySkill[s].correct} of {result.correctBySkill[s].total} correct</p>
                </div>
              ))}
            </div>
            <div className={cx("mt-8 rounded-2xl p-6", LEVEL_THEME[result.recommendedLevel].panel, result.recommendedLevel === 1 ? "text-navy" : "text-white")}>
              <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4" /> We recommend</p>
              <p className="mt-1 font-serif text-3xl font-bold">Level {result.recommendedLevel} · {LEVEL_NAME[result.recommendedLevel]}</p>
              <p className="mt-2 text-sm opacity-90">Your skill map has been initialised from these answers — the weakest micro-skills will be prioritised in your path.</p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Link href={`/courses/${result.recommendedCourseSlug}`} className={result.recommendedLevel === 1 ? "btn-dark" : "btn-light"}>View the course</Link>
                <Link href="/mastery" className={result.recommendedLevel === 1 ? "btn-outline" : "btn-outline-light"}>See my skill map</Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PlacementPage() {
  return (
    <RequireRole roles={["learner"]}>
      <Placement />
    </RequireRole>
  );
}
