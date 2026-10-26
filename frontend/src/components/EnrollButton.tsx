"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { catalogApi } from "@/lib/api";
import type { CourseSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Spinner, useToast } from "@/components/ui";
import { cx } from "@/lib/format";

/** Enroll / continue button used on the catalog and course page. Logged-out visitors go to sign-up first. */
export function EnrollButton({ course, label = "Enroll", className, firstLessonId, onEnrolled }: { course: CourseSummary; label?: string; className?: string; firstLessonId?: string; onEnrolled?: () => void }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  if (course.enrollment) {
    return (
      <Link href={`/courses/${course.id}?continue=1`} className={cx("btn-primary w-full", className)}>
        {course.enrollment.status === "completed" ? "Review course" : "Continue learning"}
      </Link>
    );
  }

  const enroll = async () => {
    if (!user) return router.push(`/register?next=/courses/${course.id}`);
    if (user.role !== "learner") return toast("Only learner accounts can enroll in courses.", "info");
    setPending(true);
    try {
      await catalogApi.enroll(course.id);
      toast(`You're enrolled in ${course.title}.`);
      onEnrolled?.();
      router.push(firstLessonId ? `/learn/${course.id}/${firstLessonId}` : `/courses/${course.id}?continue=1`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    // Wait until we know who is logged in, or a logged-in learner would be sent to sign-up
    <button className={cx("btn-primary w-full", className)} onClick={enroll} disabled={pending || loading}>
      {pending && <Spinner className="h-4 w-4" />}
      {label}
    </button>
  );
}
