"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BookOpen, ChevronRight, Compass, History, Sparkles } from "lucide-react";
import { meApi } from "@/lib/api";
import type { DashboardData } from "@/lib/api/learning";
import { useAsync } from "@/lib/hooks";
import { RequireRole } from "@/lib/auth-context";
import { SKILL_META, band, fmtDate } from "@/lib/format";
import { SKILL_CATEGORIES } from "@/lib/types";
import { EmptyState, ErrorState, ProgressBar, Skeleton } from "@/components/ui";
import { RecommendationList, recHref } from "@/components/RecommendationList";
import { RadarChart } from "@/components/charts";
import { SkillIcon } from "@/components/SkillIcon";

// Bands run from about 3 to 7.5 in this app, so a band is drawn as (band - 3) / 4.5 on the radar
const BAND_MIN = 3;
const BAND_RANGE = 4.5;

function SectionHeading({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[17px]">{title}</h2>
      {aside}
    </div>
  );
}

function Metric({ label, value, context }: { label: string; value: string; context: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <span className="text-[26px] font-extrabold">{value}</span>
        <span className="text-[11px] text-ink-muted">{context}</span>
      </p>
    </div>
  );
}

/** Blue "Next best step" card: the top recommendation, or the lesson to resume. */
function NextBestStep({ d }: { d: DashboardData }) {
  const top = d.upNext && d.upNext.length > 0 ? d.upNext[0] : null;

  if (top) {
    return (
      <section className="flex flex-col gap-5 rounded-2xl bg-brand p-6 text-white" aria-labelledby="next-h">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-extrabold uppercase tracking-eyebrow">Next best step</p>
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        <span className="pill w-fit bg-white/15 text-white">{SKILL_META[top.skill].label} · {top.kind === "lesson" ? "Lesson" : "Practice"}</span>
        <h3 id="next-h" className="text-[26px] leading-tight md:text-[29px]">{top.title}</h3>
        <p className="text-sm leading-relaxed text-white/90">{top.reason}</p>
        <Link href={recHref(top)} onClick={() => meApi.clickRecommendation(top.id).catch(() => {})} className="btn-light h-12 w-full">
          {top.kind === "lesson" ? "Start lesson" : "Start practice"} <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    );
  }

  if (d.continue) {
    const c = d.continue;
    return (
      <section className="flex flex-col gap-5 rounded-2xl bg-brand p-6 text-white" aria-labelledby="next-h">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-extrabold uppercase tracking-eyebrow">Continue learning</p>
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        <p className="text-[13px] text-white/90">{c.courseTitle} · {SKILL_META[c.skill].label} · Lesson {c.order} of {c.skillTotal}</p>
        <h3 id="next-h" className="text-[26px] leading-tight md:text-[29px]">{c.lessonTitle}</h3>
        <div className="flex items-center gap-3">
          <div className="flex-1"><ProgressBar value={c.pct} color="bg-white" track="bg-white/25" height="h-1.5" label="Course progress" /></div>
          <span className="whitespace-nowrap text-xs font-bold">{c.pct}% of course</span>
        </div>
        <Link href={`/learn/${c.courseId}/${c.lessonId}`} className="btn-light h-12 w-full">Resume lesson <ArrowRight className="h-4 w-4" /></Link>
        <Link href={d.inProgressAttempt ? `/practice/${d.inProgressAttempt.quizId}` : `/learn/${c.courseId}/${c.lessonId}#practice`} className="text-center text-xs font-bold text-white hover:underline">
          {d.inProgressAttempt ? "Resume your quiz →" : "Go to the lesson quiz →"}
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-brand p-6 text-white">
      <p className="text-[11px] font-extrabold uppercase tracking-eyebrow">Get started</p>
      <h3 className="text-[26px] leading-tight">Pick your first course</h3>
      <p className="text-sm text-white/90">Enroll in the level that fits you and your progress will appear here.</p>
      <Link href="/courses" className="btn-light h-12 w-full">Browse courses <ArrowRight className="h-4 w-4" /></Link>
    </section>
  );
}

function SkillCompass({ d }: { d: DashboardData }) {
  const bands = d.bands;
  return (
    <section className="flex flex-col gap-5" aria-labelledby="compass-h">
      <div className="flex items-center justify-between gap-3">
        <h2 id="compass-h" className="text-[17px]">Your skill compass</h2>
        {bands && <Link href="/mastery" className="text-[11px] font-bold text-brand hover:underline">Mastery map ↗</Link>}
      </div>
      <div className="card flex flex-col gap-4 p-6">
        {bands === null ? (
          <p className="text-sm text-ink-muted">Skill estimates are not available yet. They will appear here once skill tracking is switched on.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <p className="text-xs text-ink-muted">Overall estimated band</p>
              <p className="text-2xl font-extrabold text-brand">{band(d.overall)}</p>
            </div>
            <div className="flex justify-center">
              <RadarChart
                size={280}
                axes={SKILL_CATEGORIES.map((s) => `${SKILL_META[s].label} ${band(bands[s])}`)}
                values={SKILL_CATEGORIES.map((s) => Math.min(1, Math.max(0, (bands[s] - BAND_MIN) / BAND_RANGE)))}
              />
            </div>
            <ul className="flex flex-col gap-4 border-t border-line pt-4">
              {SKILL_CATEGORIES.map((s) => (
                <li key={s}>
                  <div className="mb-2 flex justify-between text-xs"><span>{SKILL_META[s].label}</span><span className="font-bold tabular-nums">{band(bands[s])}</span></div>
                  <ProgressBar value={bands[s] - BAND_MIN} max={BAND_RANGE} color="bg-brand" track="bg-brand-tint" height="h-1.5" label={`${SKILL_META[s].label} band`} />
                </li>
              ))}
            </ul>
            <p className="text-[10px] leading-normal text-ink-muted">Estimates come from your quizzes. They are not official IELTS scores.</p>
          </>
        )}
      </div>
    </section>
  );
}

function Dashboard() {
  const { data, error, loading, reload } = useAsync(() => meApi.dashboard(), []);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) {
    return (
      <div className="px-4 py-8 md:px-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-6 h-24" />
        <div className="mt-6 grid gap-6 xl:grid-cols-3"><Skeleton className="h-80" /><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
      </div>
    );
  }
  if (!data) return null;
  const d = data;
  const firstName = d.user.name.split(/\s+/)[0] || d.user.name;
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const completed = d.courses.filter((c) => c.status === "completed").length;
  const latest = d.recent.length > 0 ? d.recent[0] : null;
  const moreRecs = d.upNext && d.upNext.length > 1 ? d.upNext.slice(1) : [];

  return (
    <div className="flex flex-col gap-6 px-4 py-6 md:px-6 md:py-6">
      {/* Page header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase text-ink-muted">{today}</p>
          <h1 className="mt-2 text-[26px] leading-tight md:text-[30px]">Keep your momentum, {firstName}.</h1>
        </div>
        {d.user.targetBand > 0 && <span className="pill w-fit bg-brand-tint text-brand">Target band {band(d.user.targetBand)}</span>}
      </header>

      {!d.user.placementDone && (
        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-vanilla p-5 md:flex-row md:items-center">
          <div className="flex items-center gap-3"><Compass className="h-6 w-6 shrink-0 text-brand" /><p className="text-sm"><strong>Start with the placement quiz.</strong> It sets up your skill map so recommendations fit you from day one.</p></div>
          <Link href="/placement" className="btn-primary">Take the placement quiz</Link>
        </div>
      )}

      {/* Overview strip */}
      <section className="card flex flex-col gap-5 p-6 sm:flex-row sm:gap-6" aria-label="Overview">
        <Metric label="Estimated band" value={band(d.overall)} context={d.overall === null ? "not available yet" : "across four skills"} />
        <div className="hidden w-px self-stretch bg-line sm:block" />
        <Metric label="Courses" value={String(d.courses.length)} context={d.courses.length === 0 ? "none yet" : `${completed} completed`} />
        <div className="hidden w-px self-stretch bg-line sm:block" />
        <Metric label="Latest quiz" value={latest ? `${latest.score}/${latest.max}` : "—"} context={latest ? latest.title : "no attempts yet"} />
      </section>

      {/* Three columns on wide screens, stacked on phones */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,1.1fr)]">
        <section className="flex flex-col gap-5" aria-label="Your learning path">
          <SectionHeading title="Your learning path" aside={<Sparkles className="h-[18px] w-[18px] text-brand" aria-hidden />} />
          <NextBestStep d={d} />
          <div className="card p-6">
            <h3 className="text-sm">Up next</h3>
            <div className="mt-4">
              {d.upNext === null ? (
                <p className="text-sm text-ink-muted">Recommendations are not available yet.</p>
              ) : moreRecs.length > 0 ? (
                <RecommendationList items={moreRecs} compact />
              ) : d.upNext.length > 0 ? (
                <p className="text-sm text-ink-muted">Start with the step above. More recommendations appear after each quiz.</p>
              ) : (
                <p className="text-sm text-ink-muted">Enroll in a course to get a personalised path.</p>
              )}
            </div>
          </div>
        </section>

        <SkillCompass d={d} />

        <section className="flex flex-col gap-5" aria-labelledby="courses-h">
          <div className="flex items-center justify-between gap-3">
            <h2 id="courses-h" className="text-[17px]">Your courses</h2>
            <Link href="/courses" className="text-[11px] font-bold text-brand hover:underline">View all ↗</Link>
          </div>
          {d.courses.length === 0 ? (
            <div className="card"><EmptyState title="You haven't enrolled yet" action={<Link href="/courses" className="btn-primary">Browse courses</Link>}>Choose a level to start learning.</EmptyState></div>
          ) : (
            d.courses.map((c) => {
              const done = c.perSkill.reduce((sum, p) => sum + p.done, 0);
              const total = c.perSkill.reduce((sum, p) => sum + p.total, 0);
              return (
                <Link key={c.course.id} href={`/courses/${c.course.id}`} className="flex flex-col gap-4 rounded-2xl bg-vanilla p-5 transition-shadow hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand"><BookOpen className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{c.course.title}</span>
                      <span className="block text-[11px] text-ink-muted">Level {c.course.level} · {done} of {total} lessons completed</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-ink-muted" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1"><ProgressBar value={c.pct} color="bg-brand" track="bg-vanilla-track" height="h-1.5" label={`${c.course.title} progress`} /></div>
                    <span className="text-xs font-bold tabular-nums">{c.pct}%</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {c.perSkill.map((p) => (
                      <span key={p.skill} className="flex items-center gap-1 text-[11px] text-ink-muted"><SkillIcon skill={p.skill} className="h-3.5 w-3.5" />{p.done}/{p.total}</span>
                    ))}
                  </div>
                </Link>
              );
            })
          )}

          <div className="card flex flex-col gap-5 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm">Recent quiz results</h3>
              <History className="h-4 w-4 text-brand" aria-hidden />
            </div>
            {d.recent.length === 0 ? (
              <p className="text-sm text-ink-muted">Your quiz scores will appear here.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {d.recent.map((r) => (
                  <li key={r.attemptId}>
                    <Link href={`/practice/result/${r.attemptId}`} className="flex items-center gap-3 rounded-lg hover:bg-ivory" aria-label={`Review ${r.title}, ${r.score} of ${r.max}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">{r.title}</span>
                        <span className="mt-1 block text-[10px] text-ink-muted">{fmtDate(r.completedAt, true)}</span>
                      </span>
                      <span className="text-sm font-extrabold tabular-nums text-brand">{r.score}/{r.max}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/my-learning/history" className="text-xs font-bold text-brand hover:underline">View quiz history →</Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function MyLearningPage() {
  return (
    <RequireRole roles={["learner"]}>
      <Dashboard />
    </RequireRole>
  );
}
