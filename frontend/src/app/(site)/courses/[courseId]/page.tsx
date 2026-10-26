"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Check, CheckCircle2, ChevronDown, Lock, PlayCircle } from "lucide-react";
import { catalogApi } from "@/lib/api";
import type { CourseDetail } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { LEVEL_THEME, SKILL_META, cx, plural } from "@/lib/format";
import { Avatar, ErrorState, PageLoader, ProgressBar } from "@/components/ui";
import { SkillTile } from "@/components/SkillIcon";
import { EnrollButton } from "@/components/EnrollButton";
import { SiteFooter } from "@/components/layout/SiteHeader";

function Syllabus({ detail }: { detail: CourseDetail }) {
  const { course, sections, enrollment } = detail;
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(sections.map((s, i) => [s.skill, i < 2])));
  const [all, setAll] = useState<Record<string, boolean>>({});

  // A link like /courses/3#reading opens and scrolls to that skill section
  useEffect(() => {
    const h = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (h && sections.some((s) => s.skill === h)) {
      setOpen((o) => ({ ...o, [h]: true }));
      setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [sections]);

  if (sections.length === 0) return <p className="card p-5 text-sm text-ink-muted">This course has no lessons yet.</p>;

  return (
    <div className="space-y-3">
      {sections.map((sec) => {
        const isOpen = open[sec.skill];
        const shown = all[sec.skill] ? sec.lessons : sec.lessons.slice(0, 4);
        return (
          <section key={sec.skill} id={sec.skill} className="scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-white">
            <button className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left" onClick={() => setOpen((o) => ({ ...o, [sec.skill]: !o[sec.skill] }))} aria-expanded={isOpen} aria-controls={`sec-${sec.skill}`}>
              <SkillTile skill={sec.skill} size={36} />
              <div className="flex-1">
                <h3 className="font-serif text-lg font-bold leading-tight">{SKILL_META[sec.skill].label}</h3>
                <p className="text-xs text-ink-muted">{plural(sec.lessons.length, "lesson")}{enrollment && <> · {sec.done} done</>}</p>
              </div>
              <ChevronDown className={cx("h-5 w-5 text-ink transition-transform", isOpen && "rotate-180")} aria-hidden />
            </button>
            {isOpen && (
              <div id={`sec-${sec.skill}`}>
                <ul>
                  {shown.map((l) => {
                    const canOpen = !!enrollment && l.unlocked;
                    const inner = (
                      <>
                        <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", l.completed ? "bg-teal text-white" : "bg-sand text-ink")}>
                          {l.completed ? <Check className="h-3.5 w-3.5" /> : l.order}
                        </span>
                        <p className="min-w-0 flex-1 text-sm font-semibold text-ink">{l.title}</p>
                        {!enrollment ? <Lock className="h-4 w-4 text-ink-soft" aria-label="Enroll to unlock" />
                          : l.completed ? <CheckCircle2 className="h-4 w-4 text-teal" aria-label="Completed" />
                          : l.unlocked ? <PlayCircle className="h-4 w-4 text-brand" aria-label="Open" />
                          : <Lock className="h-4 w-4 text-ink-soft" aria-label="Finish earlier lessons first" />}
                      </>
                    );
                    return (
                      <li key={l.id} className="border-t border-line">
                        {canOpen ? (
                          <Link href={`/learn/${course.id}/${l.id}`} className="flex items-center gap-3.5 px-4 py-3 hover:bg-cream">{inner}</Link>
                        ) : (
                          <div className="flex items-center gap-3.5 px-4 py-3">{inner}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {sec.lessons.length > 4 && (
                  <button className="w-full border-t border-line px-4 py-3.5 text-left text-sm font-semibold text-brand hover:bg-cream" onClick={() => setAll((a) => ({ ...a, [sec.skill]: !a[sec.skill] }))}>
                    {all[sec.skill] ? "Show fewer lessons" : `Show all ${sec.lessons.length} lessons`}
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CourseInner() {
  const { courseId } = useParams<{ courseId: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const { data, error, loading, reload } = useAsync(() => catalogApi.get(courseId), [courseId]);

  // "Continue learning" (?continue=1) jumps to the first open lesson that isn't completed
  useEffect(() => {
    if (sp.get("continue") && data?.enrollment) {
      const lessons = data.sections.flatMap((s) => s.lessons);
      const target = lessons.find((l) => !l.completed && l.unlocked) ?? lessons[0];
      if (target) router.replace(`/learn/${courseId}/${target.id}`);
    }
  }, [sp, data, router, courseId]);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;

  const { course, enrollment } = data;
  const t = LEVEL_THEME[course.level] ?? LEVEL_THEME[2];
  const lessons = data.sections.flatMap((s) => s.lessons);
  const done = lessons.filter((l) => l.completed).length;
  const darkHero = course.level !== 1;

  return (
    <>
      <section className={cx(t.heroBg)}>
        <div className="container py-6 md:py-7">
          <nav aria-label="Breadcrumb" className={cx("text-[13px]", darkHero ? "text-white/90" : "text-navy")}>
            <Link href="/courses" className="underline underline-offset-2">Courses</Link> / Level {course.level} {course.levelName}
          </nav>
          <span className="pill mt-3 inline-flex bg-white px-2.5 py-0.5 text-[11px] text-navy">Level {course.level}</span>
          <h1 className="mt-3 font-serif text-[34px] font-bold leading-tight md:text-[40px]">{course.title}</h1>
          {course.description && <p className={cx("mt-2 max-w-[640px] text-[15px] leading-relaxed", darkHero ? "text-white/90" : "text-ink-muted")}>{course.description}</p>}
          <p className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm font-semibold">
            <span>{plural(course.lessonCount, "lesson")}</span>
            <span>{plural(Object.values(course.skillCounts).filter(Boolean).length, "skill")}</span>
          </p>
        </div>
      </section>

      <div className="container grid gap-8 py-10 lg:grid-cols-[1fr_258px] lg:gap-7">
        <div className="min-w-0">
          <h2 className="font-serif text-2xl font-bold">Syllabus</h2>
          <div className="mt-4"><Syllabus detail={data} /></div>

          <h2 className="mt-10 font-serif text-2xl font-bold">Your instructor</h2>
          <div className="mt-4 flex items-center gap-4 rounded-2xl border border-line bg-white p-5">
            <Avatar name={course.instructorName} size={48} />
            <p className="font-semibold">{course.instructorName}</p>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-line bg-white p-5">
            {enrollment ? (
              <>
                <h2 className="font-serif text-[22px] font-bold">{enrollment.status === "completed" ? "Course completed" : "Your progress"}</h2>
                <div className="mt-3 flex items-center justify-between text-xs text-ink-muted"><span>{done} of {lessons.length} lessons</span><span>{Math.round((done / Math.max(1, lessons.length)) * 100)}%</span></div>
                <div className="mt-1.5"><ProgressBar value={done} max={lessons.length} color="bg-brand-soft" label="Course progress" /></div>
                <Link href={`/courses/${course.id}?continue=1`} className="btn-primary mt-4 w-full">{enrollment.status === "completed" ? "Review lessons" : "Continue learning"}</Link>
                <Link href="/practice" className="btn-outline mt-2.5 w-full">Practice quizzes</Link>
              </>
            ) : (
              <>
                <h2 className="font-serif text-[22px] font-bold">Start Level {course.level}</h2>
                <EnrollButton course={course} label="Enroll in this course" className="mt-4" firstLessonId={lessons[0]?.id} onEnrolled={reload} />
                {!data.canEnroll.ok && data.canEnroll.reason && <p className="mt-2 text-xs text-ink-muted">{data.canEnroll.reason}</p>}
              </>
            )}
          </div>
        </aside>
      </div>
      <SiteFooter />
    </>
  );
}

export default function CoursePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <CourseInner />
    </Suspense>
  );
}
