"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Search, Lock, PlayCircle } from "lucide-react";
import { catalogApi } from "@/lib/api";
import type { SkillCategory } from "@/lib/types";
import { SKILL_CATEGORIES } from "@/lib/types";
import { useAsync, useDebounced } from "@/lib/hooks";
import { LEVEL_THEME, SKILL_META, cx, plural } from "@/lib/format";
import { EmptyState, ErrorState, Pagination, Skeleton, SkillChip } from "@/components/ui";
import { EnrollButton } from "@/components/EnrollButton";
import { SiteFooter } from "@/components/layout/SiteHeader";
import { useAuth } from "@/lib/auth-context";

type Filter = SkillCategory | "all";

function CoursesInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { user } = useAuth();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [skill, setSkill] = useState<Filter>((sp.get("skill") as Filter) ?? "all");
  const [page, setPage] = useState(Number(sp.get("page") ?? 1));
  const dq = useDebounced(q, 250);

  useEffect(() => setPage(1), [dq, skill]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (dq) params.set("q", dq);
    if (skill !== "all") params.set("skill", skill);
    if (page > 1) params.set("page", String(page));
    router.replace(`/courses${params.toString() ? "?" + params : ""}`, { scroll: false });
  }, [dq, skill, page, router]);

  const { data, error, loading, reload } = useAsync(() => catalogApi.list({ q: dq, skill, page, pageSize: 6 }), [dq, skill, page]);
  const searching = !!dq || skill !== "all";

  return (
    <>
      <div className="container pb-16 pt-10 md:pt-12">
        <p className="eyebrow mb-2">Courses</p>
        <h1 className="font-serif text-[32px] font-bold leading-tight text-navy md:text-[40px]">Pick a level, then work through all four skills</h1>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block w-full lg:w-[440px]">
            <span className="sr-only">Search lessons or topics</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search lessons or topics, e.g. True / False / Not Given" className="input h-[42px] rounded-lg border-[#C9BFA9] pl-10" />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by skill">
            {(["all", ...SKILL_CATEGORIES] as Filter[]).map((s) => (
              <button key={s} onClick={() => setSkill(s)} aria-pressed={skill === s}
                className={cx("h-[38px] rounded-full border-[1.5px] px-4 text-sm font-semibold transition-colors", skill === s ? "border-navy bg-navy text-white" : "border-navy bg-transparent text-navy hover:bg-white")}>
                {s === "all" ? "All skills" : SKILL_META[s].label}
              </button>
            ))}
          </div>
        </div>

        {error && <ErrorState error={error} onRetry={reload} />}

        {/* Lesson search results */}
        {searching && data && (
          <section className="mt-8 rounded-2xl border border-line bg-white" aria-live="polite">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <p className="text-sm font-semibold">{plural(data.lessons.total, "lesson")} {dq ? <>match “{dq}”</> : <>in {SKILL_META[skill as SkillCategory].label}</>}</p>
              <button className="text-sm font-semibold text-brand hover:underline" onClick={() => { setQ(""); setSkill("all"); }}>Clear</button>
            </div>
            {data.lessons.items.length === 0 ? (
              <EmptyState title="No lessons found">Try a question type such as “Matching headings” or a skill like “Speaking”.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {data.lessons.items.map((h) => {
                  const course = data.courses.find((c) => c.id === h.courseId);
                  const open = !!course?.enrollment;
                  return (
                    <li key={h.lessonId}>
                      <Link href={open ? `/learn/${h.courseId}/${h.lessonId}` : `/courses/${h.courseId}#${h.skill}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-cream">
                        <SkillChip skill={h.skill} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{h.title}</p>
                          <p className="text-xs text-ink-muted">Level {h.courseLevel} · {h.courseLevelName} · Lesson {h.order}</p>
                        </div>
                        {open ? <PlayCircle className="h-4 w-4 text-brand" aria-label="Open" /> : <Lock className="h-4 w-4 text-ink-soft" aria-label="Enroll to open" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="border-t border-line py-3"><Pagination page={data.lessons.page} totalPages={data.lessons.totalPages} onChange={setPage} /></div>
          </section>
        )}

        {/* Course rows */}
        <div className="mt-10 space-y-5">
          {loading && !data
            ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-[214px]" />)
            : data?.courses.map((c) => {
                const t = LEVEL_THEME[c.level] ?? LEVEL_THEME[2];
                return (
                  <article key={c.id} className="grid overflow-hidden rounded-2xl border border-line bg-white md:grid-cols-[230px_1fr_220px] lg:grid-cols-[260px_1fr_240px]">
                    <div className={cx("flex flex-col p-5 md:min-h-[214px]", t.panel)}>
                      <p className={cx("text-[11px] font-semibold uppercase tracking-eyebrow", c.level === 1 ? "text-peach-ink" : "text-white")}>Level {c.level}</p>
                      <h2 className={cx("mt-1 break-words font-serif text-[26px] font-bold leading-tight lg:text-[30px]", t.title)}>{c.title}</h2>
                      <p className={cx("mt-auto pt-6 text-xs", t.foot)}>{plural(c.lessonCount, "lesson")}</p>
                    </div>
                    <div className="p-5 md:px-6">
                      <p className="text-sm leading-relaxed text-ink-muted">{c.description}</p>
                      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                        {SKILL_CATEGORIES.filter((s) => c.skillCounts[s] > 0).map((s) => (
                          <Link href={`/courses/${c.id}#${s}`} key={s} className={cx("flex items-center justify-between rounded-lg border border-line px-3 py-2.5 transition-opacity hover:border-navy/30", skill !== "all" && skill !== s && "opacity-40")}>
                            <SkillChip skill={s} />
                            <span className="text-xs text-ink-muted">{plural(c.skillCounts[s], "lesson")}</span>
                          </Link>
                        ))}
                      </div>
                      {c.enrollment && (
                        <p className="mt-3 text-xs font-semibold text-teal">{c.enrollment.status === "completed" ? "Completed" : `Enrolled · ${c.enrollment.pct}% complete`}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-stretch justify-center gap-2.5 border-t border-line p-5 md:border-l md:border-t-0">
                      <EnrollButton course={c} onEnrolled={reload} />
                      <Link href={`/courses/${c.id}`} className="btn-outline w-full">View syllabus</Link>
                    </div>
                  </article>
                );
              })}
          {/* The catalog needs a token, so logged-out visitors are asked to log in */}
          {data && data.courses.length === 0 && (!user
            ? <EmptyState title="Log in to see the courses" action={<Link href="/login?next=/courses" className="btn-primary">Log in</Link>} />
            : <EmptyState title="No courses for this filter" />)}
        </div>

        {/* Placement CTA */}
        {!(user?.role === "learner" && user.placementDone) && (
          <section className="mt-8 flex flex-col items-start justify-between gap-5 rounded-2xl bg-navy px-6 py-7 text-white md:flex-row md:items-center md:px-8">
            <div>
              <h2 className="font-serif text-2xl font-bold">Not sure where to start?</h2>
              <p className="mt-1 text-sm text-white/85">The placement quiz checks your skills and sets the starting point of your skill map.</p>
            </div>
            <Link href={user ? "/placement" : "/register?next=/placement"} className="btn-light px-6 py-3">Start placement quiz</Link>
          </section>
        )}
      </div>
      <SiteFooter />
    </>
  );
}

export default function CoursesPage() {
  return (
    <Suspense>
      <CoursesInner />
    </Suspense>
  );
}
