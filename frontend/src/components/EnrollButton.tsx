"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { catalogApi, ApiError } from "@/lib/api";
import type { CourseSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal, Spinner, useToast } from "@/components/ui";
import { cx } from "@/lib/format";

/**
 * Enroll / continue button used on the catalogue and course page. Handles the
 * logged-out redirect, prerequisite check (409) and the optional override.
 */
export function EnrollButton({ course, label = "Enroll", className, firstLessonId, onEnrolled }: { course: CourseSummary; label?: string; className?: string; firstLessonId?: string; onEnrolled?: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const enrolled = course.enrollment && course.enrollment.status !== "left";

  if (enrolled) {
    return (
      <Link href={`/courses/${course.slug}?continue=1`} className={cx("btn-primary w-full", className)}>
        {course.enrollment!.status === "completed" ? "Review course" : "Continue learning"}
      </Link>
    );
  }

  const go = async (override = false) => {
    if (!user) return router.push(`/register?next=/courses/${course.slug}`);
    if (user.role !== "learner") return toast("Only learner accounts can enroll in courses.", "info");
    setPending(true);
    try {
      await catalogApi.enroll(course.id, override);
      toast(`You're enrolled in ${course.title}.`);
      setBlocked(null);
      onEnrolled?.();
      router.push(firstLessonId ? `/learn/${course.slug}/${firstLessonId}` : `/courses/${course.slug}?continue=1`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "PREREQUISITE_NOT_MET") setBlocked(e.message);
      else toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button className={cx("btn-primary w-full", className)} onClick={() => go()} disabled={pending}>
        {pending && <Spinner className="h-4 w-4" />}
        {label}
      </button>
      <Modal
        open={!!blocked}
        onClose={() => setBlocked(null)}
        title={`Before you start ${course.levelName}`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => go(true)} disabled={pending}>Enroll anyway</button>
            <Link href="/placement" className="btn-primary">Take the placement quiz</Link>
          </>
        }
      >
        <p className="text-sm text-ink-muted">{blocked}</p>
        <p className="mt-3 text-sm text-ink-muted">
          The 15-minute placement quiz checks all four skills and recommends the right level. You can still enroll now, but lessons will assume the prerequisite.
        </p>
      </Modal>
    </>
  );
}
