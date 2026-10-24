"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { practiceApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { RequireRole } from "@/lib/auth-context";
import { ErrorState, PageLoader, useToast } from "@/components/ui";
import { QuizRunner } from "@/components/quiz/QuizRunner";

function Runner() {
  const { setId } = useParams<{ setId: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => practiceApi.start(setId), [setId]);

  const attemptId = data?.attempt.id;
  const onSave = useCallback(async (answers: Record<string, string>, remaining: number) => {
    if (attemptId) await practiceApi.save(attemptId, answers, remaining);
  }, [attemptId]);

  if (loading && !data) return <PageLoader label="Preparing your practice set…" />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;

  const { set, attempt, course } = data;
  const exitTo = course && set.lessonId ? `/learn/${course.slug}/${set.lessonId}` : "/practice";

  return (
    <QuizRunner
      title={`Practice set ${set.code} · ${set.title}`}
      skill={set.skill}
      sections={[set]}
      initialAnswers={attempt.answers}
      initialSeconds={attempt.remainingSeconds ?? set.minutes * 60}
      onSave={onSave}
      onExit={() => { toast("Progress saved. You can resume this set any time.", "info"); router.push(exitTo); }}
      onSubmit={async (answers, timings) => {
        try {
          const res = await practiceApi.submit(attempt.id, answers, timings);
          router.push(`/practice/result/${res.attempt.id}`);
        } catch (e) {
          toast((e as Error).message, "error");
        }
      }}
    />
  );
}

export default function PracticeRunnerPage() {
  return (
    <RequireRole roles={["learner"]}>
      <Runner />
    </RequireRole>
  );
}
