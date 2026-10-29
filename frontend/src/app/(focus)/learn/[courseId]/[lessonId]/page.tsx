"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronLeft, ListTree, Lock, X } from "lucide-react";
import { lessonApi } from "@/lib/api";
import type { LessonPassage, LessonView } from "@/lib/api";
import type { SkillCategory } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import { SKILL_META, cx } from "@/lib/format";
import { ErrorState, PageLoader, ProgressBar, Spinner, useToast } from "@/components/ui";
import { SkillIcon } from "@/components/SkillIcon";

function Sidebar({ view, onNavigate }: { view: LessonView; onNavigate?: () => void }) {
  const [openSkill, setOpenSkill] = useState<SkillCategory | null>(view.lesson.skill);
  useEffect(() => setOpenSkill(view.lesson.skill), [view.lesson.skill]);
  return (
    <nav aria-label="Course content" className="px-4 py-6">
      <p className="eyebrow-muted px-2">Course content</p>
      <ul className="mt-4 space-y-1">
        {view.sections.map((s) => {
          const complete = s.done === s.total && s.total > 0;
          const isCurrent = s.skill === view.lesson.skill;
          const expanded = openSkill === s.skill;
          return (
            <li key={s.skill}>
              <button
                onClick={() => setOpenSkill(expanded ? null : s.skill)}
                className={cx("flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-[15px] font-semibold", isCurrent ? cx(SKILL_META[s.skill].tint, SKILL_META[s.skill].chip.split(" ")[1]) : "hover:bg-ivory")}
                aria-expanded={expanded}
              >
                {complete ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white"><Check className="h-3 w-3" strokeWidth={3} /></span>
                ) : (
                  <SkillIcon skill={s.skill} className={cx("h-[18px] w-[18px]", isCurrent ? "text-ink" : "text-ink-muted")} />
                )}
                <span className="flex-1">{SKILL_META[s.skill].label}</span>
                <span className="text-xs font-normal text-ink-muted">{s.done} / {s.total}</span>
              </button>
              {expanded && (
                <ul className="mb-2 mt-1 space-y-0.5">
                  {s.lessons.map((l) => {
                    const current = l.id === view.lesson.id;
                    return (
                      <li key={l.id}>
                        <Link href={`/learn/${view.course.id}/${l.id}`} onClick={onNavigate} aria-current={current ? "page" : undefined}
                          className={cx("flex items-start gap-3 rounded-lg px-2.5 py-2 text-sm", current ? "bg-line/50 font-semibold" : "hover:bg-ivory", !l.unlocked && !current && "text-ink-soft")}>
                          {l.completed ? (
                            <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-brand text-white"><Check className="h-2.5 w-2.5" strokeWidth={3} /></span>
                          ) : current ? (
                            <span className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full border-[5px] border-brand bg-brand" />
                          ) : (
                            <span className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] border-ink-soft" />
                          )}
                          <span className="leading-snug">{l.order}. {l.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The lesson's reading texts, recordings and videos. For audio and video, `content` is the transcript. */
function Passages({ passages }: { passages: LessonPassage[] }) {
  return (
    <div className="mt-6 space-y-4">
      {passages.map((p) => (
        <section key={p.id} className="rounded-2xl border border-line bg-white p-5">
          {p.title && <h3 className="text-lg font-extrabold">{p.title}</h3>}
          {p.type === "listening_audio" && (p.mediaUrl ? <audio controls src={p.mediaUrl} className="mt-3 w-full" /> : <p className="mt-2 text-sm text-ink-muted">The recording isn&apos;t available.</p>)}
          {p.type === "video" && (p.mediaUrl ? <video controls src={p.mediaUrl} className="mt-3 w-full rounded-lg bg-black" playsInline /> : <p className="mt-2 text-sm text-ink-muted">The video isn&apos;t available.</p>)}
          {p.content && (
            p.type === "reading_text"
              ? <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink">{p.content}</p>
              : <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-brand">Show transcript</summary><p className="mt-2 whitespace-pre-line leading-relaxed text-ink">{p.content}</p></details>
          )}
        </section>
      ))}
    </div>
  );
}

export default function LessonPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const toast = useToast();
  const { user } = useAuth();
  const { data: view, error, loading, reload } = useAsync(() => lessonApi.get(courseId, lessonId), [courseId, lessonId, user?.id]);
  const [completing, setCompleting] = useState(false);
  const [drawer, setDrawer] = useState(false);

  if (loading && !view) return <PageLoader label="Loading lesson…" />;
  if (error || !view) {
    return (
      <div className="min-h-screen bg-ivory">
        <div className="border-b border-line bg-white px-4 py-4"><Link href={`/courses/${courseId}`} className="flex items-center gap-2 text-sm font-semibold text-ink"><ChevronLeft className="h-4 w-4" /> Back to course</Link></div>
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  const { lesson, course, enrollment, practice } = view;
  const completed = !!enrollment?.completedLessonIds.includes(lesson.id);
  const skillSection = view.sections.find((s) => s.skill === lesson.skill);

  const complete = async () => {
    setCompleting(true);
    try {
      const res = await lessonApi.complete(lesson.id, course.id);
      toast(res.courseCompleted ? "Course complete. Well done!" : "Lesson marked complete.");
      await reload(true);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-ivory">
      <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-line bg-white px-4 text-ink md:px-6">
        <Link href={`/courses/${course.id}`} className="flex min-w-0 items-center gap-2 text-[15px] font-bold hover:underline">
          <ChevronLeft className="h-4 w-4 shrink-0" /> <span className="truncate">{course.title}</span>
        </Link>
        <button className="ml-2 rounded-md p-1.5 hover:bg-brand-tint lg:hidden" onClick={() => setDrawer(true)} aria-label="Show course content"><ListTree className="h-4 w-4" /></button>
        {enrollment && (
          <div className="ml-auto flex items-center gap-3 md:gap-4">
            <div className="hidden w-[170px] sm:block"><ProgressBar value={view.progress.done} max={view.progress.total} color="bg-brand" track="bg-brand-tint" height="h-1.5" label="Course progress" /></div>
            <span className="whitespace-nowrap text-xs font-semibold md:text-[13px]">{view.progress.done} of {view.progress.total} lessons complete</span>
          </div>
        )}
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-[262px] shrink-0 border-r border-line bg-white lg:block">
          <div className="sticky top-[60px] max-h-[calc(100vh-60px)] overflow-y-auto scrollbar-thin"><Sidebar view={view} /></div>
        </aside>
        {drawer && (
          <div className="fixed inset-0 z-40 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Course content">
            <div className="w-[290px] max-w-[85%] overflow-y-auto bg-white">
              <div className="flex justify-end p-2"><button className="rounded-lg p-2 hover:bg-line/50" onClick={() => setDrawer(false)} aria-label="Close"><X className="h-5 w-5" /></button></div>
              <Sidebar view={view} onNavigate={() => setDrawer(false)} />
            </div>
            <button className="flex-1 bg-ink/40" onClick={() => setDrawer(false)} aria-label="Close course content" />
          </div>
        )}

        <div className="min-w-0 flex-1 px-4 pb-10 pt-8 md:px-9">
          <div className="max-w-[812px]">
            <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-ink-muted">
              <span className={cx("pill px-2.5 py-1", SKILL_META[lesson.skill].chip)}>{SKILL_META[lesson.skill].label}</span>
              {skillSection && <>Lesson {lesson.order} of {skillSection.total} · </>}Level {course.level}
            </div>
            <h1 className="mt-2 text-[28px] font-extrabold leading-tight md:text-[34px]">{lesson.title}</h1>

            {!view.unlocked ? (
              <div className="mt-8 rounded-2xl border border-line bg-white p-8 text-center">
                <Lock className="mx-auto h-8 w-8 text-ink-soft" />
                <h2 className="mt-3 text-xl font-extrabold">Finish the earlier lessons first</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">Lessons open in order, so each one builds on the last.</p>
              </div>
            ) : (
              <>
                {lesson.content && <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-ink">{lesson.content}</p>}
                {view.passages.length > 0 && <Passages passages={view.passages} />}
              </>
            )}

            {view.unlocked && (practice || enrollment) && (
              <div id="practice" className="mt-10 flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 md:flex-row md:items-center">
                <div className="flex-1">
                  <p className="eyebrow-muted">Up next</p>
                  {practice ? (
                    <>
                      <p className="mt-1 font-semibold">Quiz · {practice.title}</p>
                      <p className="text-xs text-ink-muted">{practice.questions} questions{practice.minutes > 0 && <> · {practice.minutes} minutes</>}</p>
                    </>
                  ) : (
                    <p className="mt-1 font-semibold">Mark the lesson complete when you&apos;re done.</p>
                  )}
                </div>
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  {enrollment && (completed ? (
                    <span className="btn border-[1.5px] border-brand bg-success-tint text-brand-ink"><Check className="h-4 w-4" /> Lesson complete</span>
                  ) : (
                    <button className="btn-outline" onClick={complete} disabled={completing}>{completing && <Spinner className="h-4 w-4" />}Mark lesson complete</button>
                  ))}
                  {practice && enrollment && <Link href={`/practice/${practice.id}`} className="btn-primary">Start quiz →</Link>}
                </div>
              </div>
            )}
            {view.unlocked && (view.prevId || view.nextId) && (
              <div className="mt-4 flex justify-between text-sm font-semibold">
                {view.prevId ? <Link className="flex items-center gap-1 text-ink-muted hover:text-ink" href={`/learn/${course.id}/${view.prevId}`}><ChevronLeft className="h-4 w-4" /> Previous lesson</Link> : <span />}
                {view.nextId ? <Link className="flex items-center gap-1 text-ink-muted hover:text-ink" href={`/learn/${course.id}/${view.nextId}`}>Next lesson <ArrowRight className="h-4 w-4" /></Link> : <span />}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
