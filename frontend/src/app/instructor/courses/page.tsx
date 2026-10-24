"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { instructorApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { LEVEL_THEME, SKILL_META, cx } from "@/lib/format";
import { SKILL_CATEGORIES } from "@/lib/types";
import { EmptyState, ErrorState, PageHeader, PageLoader } from "@/components/ui";
import { CourseStatusPill } from "@/components/studio/CourseStatusPill";

export default function StudioCourses() {
  const { data, error, loading, reload } = useAsync(() => instructorApi.courses(), []);
  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Instructor studio" title="Courses" actions={<Link href="/instructor/courses/new" className="btn-primary"><Plus className="h-4 w-4" /> New course</Link>}>
        Create a course, add lessons and practice sets, then submit it for admin review. Approved courses can be published or hidden at any time.
      </PageHeader>
      {data.length === 0 ? <div className="card"><EmptyState title="No courses yet" action={<Link href="/instructor/courses/new" className="btn-primary">Create your first course</Link>} /></div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((c) => (
            <Link key={c.id} href={`/instructor/courses/${c.id}`} className="overflow-hidden rounded-2xl border border-line bg-white transition-colors hover:border-navy/30">
              <div className={cx("flex items-start justify-between p-5", (LEVEL_THEME[c.level] ?? LEVEL_THEME[2]).panel, c.level === 1 ? "text-peach-ink" : "text-white")}>
                <div><p className="text-[11px] font-semibold uppercase tracking-eyebrow">Level {c.level} · {c.bandRange}</p><h2 className="mt-1 font-serif text-2xl font-bold">{c.title}</h2></div>
                <span className="rounded-full bg-white/90 p-0.5"><CourseStatusPill status={c.status} /></span>
              </div>
              <div className="p-5">
                <div className="flex flex-wrap gap-2">{SKILL_CATEGORIES.filter((s) => c.skillCounts[s]).map((s) => <span key={s} className={cx("pill", SKILL_META[s].chip)}>{SKILL_META[s].label} · {c.skillCounts[s]}</span>)}</div>
                <p className="mt-4 text-sm text-ink-muted">{c.learners} learners · {c.avgProgress}% average progress · {c.completionRate}% completed{c.pendingSubmissions ? ` · ${c.pendingSubmissions} to grade` : ""}</p>
                {c.status === "rejected" && c.reviewFeedback && <p className="mt-3 rounded-lg bg-skill-w-bg px-3 py-2 text-xs text-skill-w-ink">Reviewer: {c.reviewFeedback}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
