"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, Clock, ListChecks, Sparkles } from "lucide-react";
import { practiceApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { RequireRole, useAuth } from "@/lib/auth-context";
import { ErrorState, PageLoader, useToast } from "@/components/ui";
import { SkillTile } from "@/components/SkillIcon";
import { QuizRunner } from "@/components/quiz/QuizRunner";
import { Logo } from "@/components/layout/Logo";

/**
 * The 30-question diagnostic. It is a normal quiz attempt: started when the learner
 * presses "Start", graded on submit, then reviewed on the post-quiz screen. It can only
 * be taken once. Its answers seed the skill map once BKT runs (Phase 3).
 */
function Placement() {
  const { data, error, loading, reload } = useAsync(() => practiceApi.placement(), []);
  const { refresh } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;

  const start = async () => {
    setStarting(true);
    try {
      setAttemptId(await practiceApi.startPlacement(data.quizId));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setStarting(false);
    }
  };

  const submit = async (answers: Record<string, string>, timings: Record<string, number>) => {
    if (!attemptId) return;
    try {
      await practiceApi.submit(attemptId, answers, timings);
      await refresh();
      router.push(`/practice/result/${attemptId}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  if (attemptId) {
    return (
      <QuizRunner
        title={`Placement quiz · ${data.totalQuestions} questions`}
        sections={data.sections}
        initialSeconds={data.minutes * 60}
        allowUntimed={false}
        onExit={() => setAttemptId(null)}
        onSubmit={submit}
      />
    );
  }

  return (
    <div className="min-h-screen bg-ivory">
      <header className="border-b border-line">
        <div className="container flex h-[70px] items-center justify-between">
          <Logo />
          <Link href="/my-learning" className="flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink"><ChevronLeft className="h-4 w-4" /> My learning</Link>
        </div>
      </header>
      <div className="container max-w-3xl py-12">
        <p className="eyebrow">Placement quiz</p>
        <h1 className="mt-2 text-[36px] font-extrabold leading-tight md:text-[44px]">Find your starting point</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-ink-muted">
          {data.totalQuestions} objective questions across the skills. Your answers set the starting point of your skill map, so recommendations fit you from your first lesson.
        </p>
        {data.alreadyDone && (
          <p className="mt-4 rounded-xl bg-skill-r-bg px-4 py-3 text-sm text-skill-r-ink">
            You&apos;ve already taken the placement quiz, and it can only be taken once.{" "}
            {data.completedAttemptId && <Link href={`/practice/result/${data.completedAttemptId}`} className="font-semibold underline">Review your answers</Link>}
          </p>
        )}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {data.sections.map((s) => (
            <div key={s.id} className="card flex items-center gap-4 p-4">
              <SkillTile skill={s.skill} />
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="text-xs text-ink-muted">{s.questions.length} questions</p>
              </div>
            </div>
          ))}
        </div>
        <ul className="mt-8 space-y-2.5 text-sm text-ink-muted">
          {data.minutes > 0 && <li className="flex gap-2.5"><Clock className="h-4 w-4 text-brand" /> {data.minutes} minutes in total. Answers are submitted automatically when time runs out.</li>}
          <li className="flex gap-2.5"><ListChecks className="h-4 w-4 text-brand" /> Move freely between sections with the tabs and the question numbers at the bottom.</li>
          <li className="flex gap-2.5"><Sparkles className="h-4 w-4 text-brand" /> Listening uses your device&apos;s speakers or headphones.</li>
        </ul>
        {!data.alreadyDone && <button className="btn-primary mt-10 px-8 py-3 text-base" onClick={start} disabled={starting}>Start the quiz</button>}
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
