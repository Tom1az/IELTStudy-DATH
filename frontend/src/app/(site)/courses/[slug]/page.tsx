"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Check, CheckCircle2, ChevronDown, Lock, PlayCircle, Users } from "lucide-react";
import { catalogApi } from "@/lib/api";
import type { CourseDetail } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { LEVEL_THEME, SKILL_META, cx, plural } from "@/lib/format";
import { Avatar, ConfirmDialog, ErrorState, PageLoader, ProgressBar, useToast } from "@/components/ui";
import { SkillTile } from "@/components/SkillIcon";
import { EnrollButton } from "@/components/EnrollButton";
import { SiteFooter } from "@/components/layout/SiteHeader";

function Syllabus({ detail }: { detail: CourseDetail }) {
  const { course, sections, enrollment } = detail;
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(sections.map((s, i) => [s.skill, i < 2])));
  const [all, setAll] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const h = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (h && sections.some((s) => s.skill === h)) {
      setOpen((o) => ({ ...o, [h]: true }));
      setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [sections]);

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
                <p className="text-xs text-ink-muted">
                  {plural(sec.lessons.length, "lesson")} · {plural(sec.lessons.length, "practice set")}
                  {enrollment && <> · {sec.lessons.filter((l) => l.completed).length} done</>}
                </p>
              </div>
              <ChevronDown className={cx("h-5 w-5 text-ink transition-transform", isOpen && "rotate-180")} aria-hidden />
            </button>
            {isOpen && (
              <div id={`sec-${sec.skill}`}>
                <ul>
                  {shown.map((l) => {
                    const canOpen = (!!enrollment && l.unlocked) || l.freePreview;
                    const inner = (
                      <>
                        <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", l.completed ? "bg-teal text-white" : "bg-sand text-ink")}>
                          {l.completed ? <Check className="h-3.5 w-3.5" /> : l.order}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink">{l.title}</p>
                          <p className="text-xs text-ink-muted">Video {l.videoMinutes} min · Practice {l.questions} questions</p>
                        </div>
                        {enrollment ? (
                          l.completed ? <CheckCircle2 className="h-4 w-4 text-teal" aria-label="Completed" /> : l.unlocked ? <PlayCircle className="h-4 w-4 text-brand" aria-label="Open" /> : <Lock className="h-4 w-4 text-ink-soft" aria-label="Finish previous lessons first" />
                        ) : l.freePreview ? (
                          <span className="whitespace-nowrap text-sm font-semibold text-brand">Free preview →</span>
                        ) : (
                          <Lock className="h-4 w-4 text-ink-soft" aria-label="Enroll to unlock" />
                        )}
                      </>
                    );
                    return (
                      <li key={l.id} className="border-t border-line">
                        {canOpen ? (
                          <Link href={`/learn/${course.slug}/${l.id}`} className="flex items-center gap-3.5 px-4 py-3 hover:bg-cream">{inner}</Link>
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
  const { slug } = useParams<{ slug: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => catalogApi.get(slug), [slug]);
  const [leaving, setLeaving] = useState(false);
  const [leavePending, setLeavePending] = useState(false);

  useEffect(() => {
    if (sp.get("continue") && data?.enrollment) {
      const all = data.sections.flatMap((s) => s.lessons);
      const target = data.enrollment.lastLessonId && all.some((l) => l.id === data.enrollment!.lastLessonId) ? data.enrollment.lastLessonId : (all.find((l) => !l.completed && l.unlocked) ?? all[0])?.id;
      if (target) router.replace(`/learn/${slug}/${target}`);
    }
  }, [sp, data, router, slug]);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;

  const { course, enrollment } = data;
  const t = LEVEL_THEME[course.level] ?? LEVEL_THEME[2];
  const lessons = data.sections.flatMap((s) => s.lessons);
  const preview = lessons.find((l) => l.freePreview);
  const done = lessons.filter((l) => l.completed).length;
  const darkHero = course.level !== 1;

  const leave = async () => {
    setLeavePending(true);
    try {
      await catalogApi.leave(course.id);
      toast(`You left ${course.title}. Your progress is kept if you re-enroll.`, "info");
      setLeaving(false);
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setLeavePending(false);
    }
  };

  return (
    <>
      <section className={cx(t.heroBg)}>
        <div className="container py-6 md:py-7">
          <nav aria-label="Breadcrumb" className={cx("text-[13px]", darkHero ? "text-white/90" : "text-navy")}>
            <Link href="/courses" className="underline underline-offset-2">Courses</Link> / Level {course.level} {course.levelName}
          </nav>
          <div className="mt-3 flex items-center gap-2.5">
            <span className="pill bg-white px-2.5 py-0.5 text-[11px] text-navy">Level {course.level}</span>
            <span className="text-sm font-semibold">{course.bandRange}</span>
          </div>
          <h1 className="mt-3 font-serif text-[34px] font-bold leading-tight md:text-[40px]">{course.title}</h1>
          <p className={cx("mt-2 max-w-[640px] text-[15px] leading-relaxed", darkHero ? "text-white/90" : "text-ink-muted")}>{course.catalogBlurb.replace(" in all four skills.", " in Listening, Reading, Writing and Speaking.")}</p>
          <p className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm font-semibold">
            <span>{course.lessonCount} lessons</span>
            <span>{course.practiceSetCount} practice sets</span>
            <span>{Object.values(course.skillCounts).filter(Boolean).length} skills</span>
            <span>≈ {course.hours} hours</span>
          </p>
        </div>
      </section>

      <div className="container grid gap-8 py-10 lg:grid-cols-[1fr_258px] xl:grid-cols-[1fr_258px] lg:gap-7">
        <div className="min-w-0 lg:max-w-[558px] xl:max-w-none">
          <h2 className="font-serif text-2xl font-bold">What you will learn</h2>
          <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {course.outcomes.map((o) => (
              <li key={o} className="flex gap-2.5 text-sm text-ink-muted"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />{o}</li>
            ))}
          </ul>

          <h2 className="mt-9 font-serif text-2xl font-bold">Syllabus</h2>
          <div className="mt-4"><Syllabus detail={data} /></div>

          <h2 className="mt-10 font-serif text-2xl font-bold">Your instructor</h2>
          <div className="mt-4 flex gap-4 rounded-2xl border border-line bg-white p-5">
            <Avatar name={data.instructor.name} size={48} />
            <div>
              <p className="font-semibold">{data.instructor.name}</p>
              <p className="mt-1 text-sm text-ink-muted">{data.instructor.bio}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-soft"><Users className="h-3.5 w-3.5" /> {plural(data.learners, "learner")} enrolled</p>
            </div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-line bg-white p-5">
            {enrollment ? (
              <>
                <h2 className="font-serif text-[22px] font-bold">{enrollment.status === "completed" ? "Course completed" : "Your progress"}</h2>
                <div className="mt-3 flex items-center justify-between text-xs text-ink-muted"><span>{done} of {lessons.length} lessons</span><span>{Math.round((done / Math.max(1, lessons.length)) * 100)}%</span></div>
                <div className="mt-1.5"><ProgressBar value={done} max={lessons.length} color="bg-brand-soft" label="Course progress" /></div>
                <Link href={`/courses/${course.slug}?continue=1`} className="btn-primary mt-4 w-full">{enrollment.status === "completed" ? "Review lessons" : "Continue learning"}</Link>
                <Link href="/practice" className="btn-outline mt-2.5 w-full">Practice sets</Link>
              </>
            ) : (
              <>
                <h2 className="font-serif text-[22px] font-bold">Start Level {course.level}</h2>
                <EnrollButton course={course} label="Enroll in this course" className="mt-4" firstLessonId={lessons[0]?.id} onEnrolled={reload} />
                {preview && <Link href={`/learn/${course.slug}/${preview.id}`} className="btn-outline mt-2.5 w-full">Try a free preview lesson</Link>}
                {!data.canEnroll.ok && data.canEnroll.reason && <p className="mt-2 text-xs text-ink-muted">{data.canEnroll.reason}</p>}
              </>
            )}
            <hr className="my-4 border-line" />
            <p className="eyebrow-muted">This course includes</p>
            <ul className="mt-3 space-y-2">
              {course.includes.map((i) => <li key={i} className="flex gap-2 text-[13px] text-ink"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" aria-hidden />{i}</li>)}
            </ul>
            <hr className="my-4 border-line" />
            <p className="text-xs text-ink-muted"><span className="font-semibold text-ink">Prerequisite:</span> {course.prerequisiteText.replace("Level 1 or a placement score of 5.0+", "Level 1, or a placement quiz score of 5.0 or higher.").replace("Level 2 or a placement score of 6.5+", "Level 2, or a placement quiz score of 6.5 or higher.")}</p>
            {enrollment && enrollment.status === "active" && (
              <button className="mt-4 text-xs font-semibold text-ink-muted underline hover:text-danger" onClick={() => setLeaving(true)}>Leave this course</button>
            )}
          </div>
        </aside>
      </div>

      <ConfirmDialog open={leaving} onClose={() => setLeaving(false)} onConfirm={leave} pending={leavePending} danger title="Leave this course?" confirmLabel="Leave course"
        body={<>The course will be removed from My learning. Your completed lessons and practice results are kept, so you can pick up where you left off if you enroll again.</>} />
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
