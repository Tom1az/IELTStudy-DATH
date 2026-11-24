"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { practiceApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { RequireRole } from "@/lib/auth-context";
import { ErrorState, PageLoader, useToast } from "@/components/ui";
import { QuizRunner } from "@/components/quiz/QuizRunner";

function Runner() {
  const { quizId } = useParams<{ quizId: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => practiceApi.start(quizId), [quizId]);
  // The "we brought your answers back" message belongs to the attempt, not to every render
  const announced = useRef<string | null>(null);

  const attemptId = data?.attempt.id;
  const onSave = useCallback(async (answers: Record<string, string>, remaining: number) => {
    if (!attemptId) return;
    return practiceApi.save(attemptId, answers, remaining);
  }, [attemptId]);

  useEffect(() => {
    if (!data || !attemptId || announced.current === attemptId) return;
    announced.current = attemptId;
    if (data.restoredFrom) {
      toast(data.restoredFrom === "server" ? "Your saved answers are back." : "Restored the answers saved in this browser.", "info");
    }
  }, [data, attemptId, toast]);

  if (loading && !data) return <PageLoader label="Preparing your quiz…" />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;

  const { quiz, sections, attempt, courseId, lessonId } = data;
  const exitTo = courseId && lessonId ? `/learn/${courseId}/${lessonId}` : "/practice";
  const seconds = attempt.remainingSeconds ?? quiz.minutes * 60;

  return (
    <QuizRunner
      title={quiz.title}
      skill={quiz.skill}
      sections={sections}
      initialAnswers={attempt.answers}
      initialSeconds={seconds}
      // A quiz without a time limit can't be switched to timed mode
      allowUntimed={seconds > 0}
      onSave={onSave}
      onExit={() => { toast("Your answers are saved. You can resume any time.", "info"); router.push(exitTo); }}
      onSubmit={async (answers, timings, touchOrder) => {
        try {
          const res = await practiceApi.submit(attempt.id, answers, timings, touchOrder);
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
