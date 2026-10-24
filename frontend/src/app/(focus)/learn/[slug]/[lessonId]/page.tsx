"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronLeft, Flag, Lock, ListTree, PenSquare, X, AlertTriangle } from "lucide-react";
import { lessonApi } from "@/lib/api";
import type { LessonView } from "@/lib/api";
import type { SkillCategory } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import { SKILL_META, cx, fmtDate } from "@/lib/format";
import { Alert, ErrorState, PageLoader, ProgressBar, Spinner, Tabs, useToast } from "@/components/ui";
import { SkillIcon } from "@/components/SkillIcon";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/lesson/VideoPlayer";
import { Discussion } from "@/components/lesson/Discussion";
import { ReportDialog } from "@/components/ReportDialog";

type Tab = "overview" | "transcript" | "notes" | "discussion";

function Sidebar({ view, onNavigate }: { view: LessonView; onNavigate?: () => void }) {
  const [openSkill, setOpenSkill] = useState<SkillCategory>(view.lesson.skill);
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
                onClick={() => setOpenSkill(expanded ? ("" as SkillCategory) : s.skill)}
                className={cx("flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-[15px] font-semibold", isCurrent ? cx(SKILL_META[s.skill].tint, SKILL_META[s.skill].chip.split(" ")[1]) : "hover:bg-cream")}
                aria-expanded={expanded}
              >
                {complete ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal text-white"><Check className="h-3 w-3" strokeWidth={3} /></span>
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
                        <Link href={`/learn/${view.course.slug}/${l.id}`} onClick={onNavigate} aria-current={current ? "page" : undefined}
                          className={cx("flex items-start gap-3 rounded-lg px-2.5 py-2 text-sm", current ? "bg-sand font-semibold" : "hover:bg-cream", !l.unlocked && !current && "text-ink-soft")}>
                          {l.completed ? (
                            <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-teal text-white"><Check className="h-2.5 w-2.5" strokeWidth={3} /></span>
                          ) : current ? (
                            <span className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full border-[5px] border-brand bg-brand" />
                          ) : l.gated ? (
                            <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-skill-r" aria-label="Review recommended first" />
                          ) : (
                            <span className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] border-ink-soft" />
                          )}
                          <span className="leading-snug">{l.order}. {l.shortTitle ?? l.title}</span>
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

function Notes({ lessonId, initial }: { lessonId: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setState("saving");
    const t = setTimeout(() => lessonApi.saveNote(lessonId, text).then(() => setState("saved")).catch(() => setState("error")), 600);
    return () => clearTimeout(t);
  }, [text, lessonId]);
  return (
    <div>
      <label htmlFor="notes" className="label">Your private notes for this lesson</label>
      <textarea id="notes" value={text} onChange={(e) => setText(e.target.value)} className="input min-h-[220px] font-[inherit] leading-relaxed" placeholder="Write down the method in your own words…" maxLength={5000} />
      <p className="mt-1.5 text-xs text-ink-soft" aria-live="polite">{state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Couldn't save — check your connection." : `${text.length} / 5000`}</p>
    </div>
  );
}

const TONE = { true: "bg-teal-tint text-teal-ink", false: "bg-skill-w-bg text-[#8A2E09]", ng: "bg-skill-s-bg text-[#3A296D]", neutral: "bg-sand text-ink" };

function LessonInner() {
  const { slug, lessonId } = useParams<{ slug: string; lessonId: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { data: view, error, loading, reload } = useAsync(() => lessonApi.get(slug, lessonId), [slug, lessonId, user?.id]);
  const [tab, setTab] = useState<Tab>((sp.get("tab") as Tab) ?? "overview");
  const [postCount, setPostCount] = useState<number | null>(null);
  const shownCount = postCount ?? view?.postCount ?? null;
  const [completing, setCompleting] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [ended, setEnded] = useState(false);
  const seekRef = useRef<VideoPlayerHandle | null>(null);

  useEffect(() => { setTab((sp.get("tab") as Tab) ?? "overview"); setPostCount(null); setEnded(false); }, [lessonId, sp]);

  const saveProgress = useCallback((s: number) => { if (view?.enrollment) lessonApi.savePosition(lessonId, s).catch(() => {}); }, [lessonId, view?.enrollment]);
  const onEnded = useCallback(() => setEnded(true), []);

  if (loading && !view) return <PageLoader label="Loading lesson…" />;
  if (error || !view) {
    return (
      <div className="min-h-screen bg-cream">
        <div className="bg-navy px-4 py-4"><Link href={`/courses/${slug}`} className="flex items-center gap-2 text-sm font-semibold text-white"><ChevronLeft className="h-4 w-4" /> Back to course</Link></div>
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
      const res = await lessonApi.complete(lesson.id);
      toast(res.courseCompleted ? `Course complete — well done!` : "Lesson marked complete.");
      await reload(true);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setCompleting(false);
    }
  };

  const override = async () => {
    if (!view.gate) return;
    await lessonApi.overrideGate(view.gate.id);
    toast("Gate removed. You can come back to the review later from My learning.", "info");
    reload(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      {/* top bar */}
      <header className="sticky top-0 z-30 flex h-[52px] items-center gap-3 bg-navy px-4 text-white md:px-6">
        <Link href={`/courses/${course.slug}`} className="flex min-w-0 items-center gap-2 text-[15px] font-semibold hover:underline">
          <ChevronLeft className="h-4 w-4 shrink-0" /> <span className="truncate">{course.title}</span>
        </Link>
        <button className="ml-2 rounded-md p-1.5 hover:bg-white/10 lg:hidden" onClick={() => setDrawer(true)} aria-label="Show course content"><ListTree className="h-4 w-4" /></button>
        {enrollment && (
          <div className="ml-auto flex items-center gap-3 md:gap-4">
            <div className="hidden w-[170px] sm:block"><ProgressBar value={view.progress.done} max={view.progress.total} color="bg-brand-soft" track="bg-navy-600" height="h-1.5" label="Course progress" /></div>
            <span className="whitespace-nowrap text-xs md:text-[13px]">{view.progress.done} of {view.progress.total} lessons complete</span>
          </div>
        )}
        {!enrollment && <span className="ml-auto rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">Preview</span>}
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-[262px] shrink-0 border-r border-line bg-white lg:block">
          <div className="sticky top-[52px] max-h-[calc(100vh-52px)] overflow-y-auto scrollbar-thin"><Sidebar view={view} /></div>
        </aside>
        {drawer && (
          <div className="fixed inset-0 z-40 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Course content">
            <div className="w-[290px] max-w-[85%] overflow-y-auto bg-white">
              <div className="flex justify-end p-2"><button className="rounded-lg p-2 hover:bg-sand" onClick={() => setDrawer(false)} aria-label="Close"><X className="h-5 w-5" /></button></div>
              <Sidebar view={view} onNavigate={() => setDrawer(false)} />
            </div>
            <button className="flex-1 bg-navy/40" onClick={() => setDrawer(false)} aria-label="Close course content" />
          </div>
        )}

        <div className="min-w-0 flex-1 px-4 pb-10 pt-8 md:px-9">
          <div className="max-w-[812px] xl:max-w-[860px]">
            <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-ink-muted">
              <span className={cx("pill px-2.5 py-1", SKILL_META[lesson.skill].chip)}>{SKILL_META[lesson.skill].label}</span>
              Lesson {lesson.order} of {skillSection?.total} · Level {course.level}
              {lesson.status !== "published" && <span className="pill bg-sand text-ink-muted">{lesson.status}</span>}
            </div>
            <h1 className="mt-2 font-serif text-[28px] font-bold leading-tight md:text-[34px]">{lesson.title}</h1>

            {view.previewOnly && (
              <Alert tone="info" className="mt-4">
                You&apos;re watching a free preview. <Link href={`/courses/${course.slug}`} className="link">Enroll in {course.title}</Link> to save progress, take every practice set and join the discussion.
              </Alert>
            )}

            {!view.unlocked ? (
              <div className="mt-8 rounded-2xl border border-line bg-white p-8 text-center">
                <Lock className="mx-auto h-8 w-8 text-ink-soft" />
                <h2 className="mt-3 font-serif text-xl font-semibold">Finish the earlier {SKILL_META[lesson.skill].label} lessons first</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">Lessons in each skill build on each other, so they open in order.</p>
                {(() => {
                  const next = skillSection?.lessons.find((l) => !l.completed);
                  return next ? <Link href={`/learn/${course.slug}/${next.id}`} className="btn-primary mt-5">Go to lesson {next.order}: {next.shortTitle ?? next.title}</Link> : null;
                })()}
              </div>
            ) : (
              <>
                {view.gate && (
                  <div className="mt-5 rounded-2xl border border-skill-r/40 bg-skill-r-bg p-5">
                    <p className="flex items-center gap-2 text-sm font-semibold text-skill-r-ink"><AlertTriangle className="h-4 w-4" /> Review recommended before this lesson</p>
                    <p className="mt-1.5 text-sm text-skill-r-ink">
                      Your mastery of <strong>{view.gate.skillName}</strong> is {view.gate.mastery.toFixed(2)} (target 0.65). A short review now usually saves time later.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {view.gate.attemptId && <Link href={`/practice/result/${view.gate.attemptId}`} className="btn-dark btn-sm">See recommended review</Link>}
                      <button className="btn-ghost btn-sm text-skill-r-ink" onClick={override}>Continue anyway</button>
                    </div>
                  </div>
                )}

                <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_214px]">
                  <VideoPlayer
                    key={lesson.id}
                    title={lesson.title}
                    minutes={lesson.videoMinutes}
                    transcript={lesson.transcript}
                    strategy={lesson.strategy}
                    videoUrl={lesson.videoUrl}
                    startAt={enrollment?.lastPositionSeconds?.[lesson.id] ?? 0}
                    onProgress={saveProgress}
                    onEnded={onEnded}
                    seekRef={seekRef}
                  />
                  <div className="self-start rounded-2xl border border-line bg-white p-4">
                    <h2 className="font-serif text-lg font-bold">Lesson resources</h2>
                    <ul className="mt-3 space-y-2.5">
                      {lesson.resources.map((r) => (
                        <li key={r.id}>
                          <Link href={r.url ?? `/learn/${course.slug}/${lesson.id}/resources/${r.id}`} target={r.url ? "_blank" : undefined} className="block rounded-xl border border-line px-3 py-2.5 hover:border-navy/40">
                            <p className="text-sm font-semibold">{r.title}</p>
                            <p className="text-xs text-ink-muted">{r.meta}</p>
                          </Link>
                        </li>
                      ))}
                      {lesson.resources.length === 0 && <li className="text-sm text-ink-muted">No downloads for this lesson.</li>}
                    </ul>
                  </div>
                </div>

                {ended && enrollment && !completed && (
                  <Alert tone="success" className="mt-4">
                    Video finished. <button className="link" onClick={complete}>Mark the lesson complete</button> and try the practice set.
                  </Alert>
                )}

                <div className="mt-6 xl:max-w-[calc(100%-234px)]">
                  <Tabs<Tab>
                    value={tab}
                    onChange={(t) => { setTab(t); router.replace(`/learn/${course.slug}/${lesson.id}${t === "overview" ? "" : `?tab=${t}`}`, { scroll: false }); }}
                    tabs={[
                      { id: "overview", label: "Overview" },
                      { id: "transcript", label: "Transcript" },
                      { id: "notes", label: "Notes" },
                      { id: "discussion", label: `Discussion${shownCount !== null ? ` (${shownCount})` : ""}` },
                    ]}
                  />
                  <div className="pt-6">
                    {tab === "overview" && (
                      <div>
                        <h2 className="font-serif text-[22px] font-bold">Key strategy</h2>
                        <ol className="mt-3 space-y-2.5">
                          {lesson.strategy.map((s, i) => (
                            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink"><span className="font-semibold text-brand">{i + 1}</span><span>{s}</span></li>
                          ))}
                        </ol>
                        {lesson.workedExample && (
                          <div className="mt-6 rounded-2xl border border-line bg-white p-5">
                            <p className="eyebrow-muted">Worked example</p>
                            <blockquote className="mt-3 rounded-xl bg-sand px-4 py-3 text-[15px] leading-relaxed">“{lesson.workedExample.quote}”</blockquote>
                            <ul className="mt-4 space-y-3">
                              {lesson.workedExample.items.map((it) => (
                                <li key={it.tag + it.statement} className="flex items-start gap-3">
                                  <span className={cx("mt-0.5 min-w-[76px] shrink-0 whitespace-nowrap rounded px-1.5 py-1 text-center text-[11px] font-semibold", TONE[it.tone])}>{it.tag}</span>
                                  <p className="text-sm leading-relaxed text-ink"><strong>{it.statement}</strong> {it.explanation}</p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {lesson.bodyText && <p className="mt-6 text-[15px] leading-relaxed text-ink-muted">{lesson.bodyText}</p>}
                        {view.assignment && (
                          <Link href={`/assignments/${view.assignment.id}`} className="mt-6 flex items-center gap-4 rounded-2xl border border-line bg-white p-4 hover:border-navy/30">
                            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-skill-w-bg text-skill-w"><PenSquare className="h-5 w-5" /></span>
                            <div className="flex-1">
                              <p className="text-sm font-semibold">Writing task · {view.assignment.title}</p>
                              <p className="text-xs text-ink-muted">Submit a file or paste your answer · Due {fmtDate(view.assignment.dueAt, true)} · Graded by your instructor</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-brand" />
                          </Link>
                        )}
                        <button className="mt-6 flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-danger" onClick={() => setReporting(true)}><Flag className="h-3.5 w-3.5" /> Report a problem with this lesson</button>
                      </div>
                    )}
                    {tab === "transcript" && (
                      <div className="space-y-4">
                        <p className="text-xs text-ink-soft">Select a paragraph to jump the video to that point.</p>
                        {lesson.transcript.split(/\n\n+/).map((p, i, arr) => (
                          <button key={i} className="block w-full rounded-lg px-2 py-1 text-left text-[15px] leading-relaxed text-ink hover:bg-white"
                            onClick={() => seekRef.current?.seek(((lesson.videoMinutes * 60 + 5) * i) / arr.length)}>
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                    {tab === "notes" && (user ? <Notes key={lesson.id} lessonId={lesson.id} initial={view.note} /> : <p className="text-sm text-ink-muted"><Link href="/login" className="link">Log in</Link> to keep notes.</p>)}
                    {tab === "discussion" && <Discussion lessonId={lesson.id} canPost={!!enrollment || user?.role === "instructor" || user?.role === "admin"} onCount={setPostCount} />}
                  </div>
                </div>
              </>
            )}

            {/* Up next */}
            {view.unlocked && practice && (
              <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 md:flex-row md:items-center">
                <div className="flex-1">
                  <p className="eyebrow-muted">Up next</p>
                  <p className="mt-1 font-semibold">Practice set {practice.code} · {practice.title}</p>
                  <p className="text-xs text-ink-muted">{practice.questions} questions · {practice.minutes} minutes · IELTS-style {practice.kind === "listening" ? "recording" : practice.kind === "reading" ? "passage" : "task"}</p>
                </div>
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  {enrollment && (completed ? (
                    <span className="btn border-[1.5px] border-teal bg-teal-tint text-teal-ink"><Check className="h-4 w-4" /> Lesson complete</span>
                  ) : (
                    <button className="btn-outline" onClick={complete} disabled={completing}>{completing && <Spinner className="h-4 w-4" />}Mark lesson complete</button>
                  ))}
                  {enrollment ? (
                    <Link href={`/practice/${practice.id}`} className="btn-primary">Start practice set →</Link>
                  ) : (
                    <Link href={`/courses/${course.slug}`} className="btn-primary">Enroll to practise →</Link>
                  )}
                </div>
              </div>
            )}
            {view.unlocked && (view.prevId || view.nextId) && (
              <div className="mt-4 flex justify-between text-sm font-semibold">
                {view.prevId ? <Link className="flex items-center gap-1 text-ink-muted hover:text-ink" href={`/learn/${course.slug}/${view.prevId}`}><ChevronLeft className="h-4 w-4" /> Previous lesson</Link> : <span />}
                {view.nextId ? <Link className="flex items-center gap-1 text-ink-muted hover:text-ink" href={`/learn/${course.slug}/${view.nextId}`}>Next lesson <ArrowRight className="h-4 w-4" /></Link> : <span />}
              </div>
            )}
          </div>
        </div>
      </div>
      <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="lesson" targetId={lesson.id} targetPreview={lesson.title} />
    </div>
  );
}

export default function LessonPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <LessonInner />
    </Suspense>
  );
}
