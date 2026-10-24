"use client";

import Link from "next/link";
import { CalendarClock, Compass, PenSquare } from "lucide-react";
import { meApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { RequireRole } from "@/lib/auth-context";
import { SKILL_META, SKILL_HEX, band, courseHeading, cx, dueIn, fmtDate } from "@/lib/format";
import { SKILL_CATEGORIES } from "@/lib/types";
import { EmptyState, ErrorState, ProgressBar, Skeleton, StatusPill } from "@/components/ui";
import { RecommendationList } from "@/components/RecommendationList";

function Dashboard() {
  const { data, error, loading, reload } = useAsync(() => meApi.dashboard(), []);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) {
    return (
      <div className="container py-12">
        <Skeleton className="h-10 w-64" />
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.55fr_1fr]"><Skeleton className="h-60" /><Skeleton className="h-60" /></div>
        <div className="mt-10 grid gap-5 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      </div>
    );
  }
  if (!data) return null;
  const d = data;

  return (
    <div className="container pb-16 pt-10 md:pt-12">
      <h1 className="font-serif text-[36px] font-bold text-navy md:text-[40px]">Welcome back</h1>

      {!d.user.placementDone && (
        <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-line bg-white p-5 md:flex-row md:items-center">
          <div className="flex items-center gap-3"><Compass className="h-6 w-6 text-brand" /><p className="text-sm"><strong>Start with the 15-minute placement quiz.</strong> It sets up your skill map so recommendations fit you from day one.</p></div>
          <Link href="/placement" className="btn-primary">Take the placement quiz</Link>
        </div>
      )}

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        {/* Continue learning */}
        {d.continue ? (
          <section className="flex flex-col rounded-2xl bg-navy p-6 text-white md:p-7" aria-labelledby="cont-h">
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-brand-soft">Continue learning</p>
            <p className="mt-2 text-[13px] text-white/85">{d.continue.courseTitle} · {SKILL_META[d.continue.skill].label} · Lesson {d.continue.order} of {d.continue.skillTotal}</p>
            <h2 id="cont-h" className="mt-1.5 font-serif text-[28px] font-bold leading-tight">{d.continue.lessonTitle}</h2>
            <div className="mt-5 flex items-center gap-4">
              <div className="flex-1"><ProgressBar value={d.continue.pct} color="bg-brand-soft" track="bg-navy-600" height="h-1.5" label="Course progress" /></div>
              <span className="whitespace-nowrap text-[13px] font-semibold">{d.continue.pct}% of course</span>
            </div>
            <div className="mt-auto flex flex-wrap gap-3 pt-7">
              <Link href={`/learn/${d.continue.courseSlug}/${d.continue.lessonId}`} className="btn-light px-5">Resume lesson</Link>
              <Link href={d.inProgressAttempt ? `/practice/${d.inProgressAttempt.setId}` : `/learn/${d.continue.courseSlug}/${d.continue.lessonId}#practice`} className="btn-outline-light px-5">
                Go to practice set
              </Link>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl bg-navy p-7 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-brand-soft">Get started</p>
            <h2 className="mt-2 font-serif text-[28px] font-bold">Pick your first course</h2>
            <p className="mt-2 text-sm text-white/85">Enroll in the level that fits you and your progress will appear here.</p>
            <Link href="/courses" className="btn-light mt-6">Browse courses</Link>
          </section>
        )}

        {/* Estimated band */}
        <section className="rounded-2xl border border-line bg-white p-6" aria-labelledby="band-h">
          <div className="flex items-baseline justify-between">
            <h2 id="band-h" className="font-serif text-[22px] font-bold">Estimated band by skill</h2>
            <span className="text-[13px] text-ink-muted">Overall {band(d.overall)}</span>
          </div>
          <ul className="mt-5 space-y-3.5">
            {SKILL_CATEGORIES.map((s) => (
              <li key={s} className="flex items-center gap-4">
                <span className="w-[76px] text-sm">{SKILL_META[s].label}</span>
                <div className="flex-1"><ProgressBar value={d.bands[s] - 3} max={4.5} color={SKILL_META[s].bar} height="h-2.5" label={`${SKILL_META[s].label} band`} /></div>
                <span className="w-8 text-right text-sm font-semibold tabular-nums">{band(d.bands[s])}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[11.5px] leading-snug text-ink-soft">Estimates come from your practice sets. They are not official IELTS scores.</p>
          <Link href="/mastery" className="mt-3 inline-block text-xs font-semibold text-brand hover:underline">Open skill mastery map →</Link>
        </section>
      </div>

      {/* Courses */}
      <h2 className="mt-12 font-serif text-[26px] font-bold">Your courses</h2>
      {d.courses.length === 0 ? (
        <div className="card mt-4"><EmptyState title="You haven't enrolled yet" action={<Link href="/courses" className="btn-primary">Browse courses</Link>}>Choose a level to start learning.</EmptyState></div>
      ) : (
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {d.courses.map((c) => (
            <Link key={c.course.id} href={`/courses/${c.course.slug}`} className="rounded-2xl border border-line bg-white p-5 transition-colors hover:border-navy/30">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow-muted">Level {c.course.level}</p>
                  <h3 className="mt-0.5 font-serif text-[24px] font-bold leading-tight">{courseHeading(c.course)}</h3>
                </div>
                {c.status === "completed" ? <StatusPill tone="green">Completed</StatusPill> : <StatusPill tone="amber">In progress</StatusPill>}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3.5">
                {c.perSkill.map((p) => (
                  <div key={p.skill}>
                    <div className="mb-1.5 flex justify-between text-[13px]"><span className="font-medium">{SKILL_META[p.skill].label}</span><span className="text-ink-muted">{p.done} / {p.total}</span></div>
                    <ProgressBar value={p.done} max={p.total} color={SKILL_META[p.skill].bar} height="h-1.5" track="bg-sand" label={`${SKILL_META[p.skill].label} progress`} />
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Up next + results */}
      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <section className="rounded-2xl border border-line bg-white p-5" aria-labelledby="next-h">
          <h2 id="next-h" className="font-serif text-[24px] font-bold">Up next</h2>
          <div className="mt-4">
            {d.upNext.length ? <RecommendationList items={d.upNext} compact /> : <p className="text-sm text-ink-muted">Enroll in a course to get a personalised path.</p>}
          </div>
          {d.upNext.length > 0 && <p className="mt-3 text-[11px] text-ink-soft">Ranked from your skill map in {d.recLatencyMs.toFixed(1)} ms.</p>}
        </section>

        <section className="rounded-2xl border border-line bg-white p-5" aria-labelledby="res-h">
          <div className="flex items-baseline justify-between">
            <h2 id="res-h" className="font-serif text-[24px] font-bold">Recent practice results</h2>
            <Link href="/my-learning/history" className="text-xs font-semibold text-brand hover:underline">All history</Link>
          </div>
          {d.recent.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">Your practice set scores will appear here.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Practice set</th><th>Skill</th><th>Score</th><th>Review</th></tr></thead>
                <tbody>
                  {d.recent.map((r) => (
                    <tr key={r.attemptId}>
                      <td className="font-semibold">Practice set {r.setCode} · {r.setTitle}</td>
                      <td>{SKILL_META[r.skill].label}</td>
                      <td className="font-semibold tabular-nums">{r.score} / {r.max}</td>
                      <td><Link href={`/practice/result/${r.attemptId}`} className="font-semibold text-brand hover:underline">Review</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Deadlines */}
      {d.deadlines.length > 0 && (
        <section className="mt-8 rounded-2xl border border-line bg-white p-5" aria-labelledby="dl-h">
          <h2 id="dl-h" className="flex items-center gap-2 font-serif text-[22px] font-bold"><CalendarClock className="h-5 w-5 text-brand" /> Writing tasks</h2>
          <ul className="mt-3 divide-y divide-line">
            {d.deadlines.map(({ assignment: a, submitted }) => {
              const soon = Date.parse(a.dueAt) - Date.now() < 5 * 86400000;
              return (
                <li key={a.id}>
                  <Link href={`/assignments/${a.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:bg-cream">
                    <PenSquare className="h-4 w-4" style={{ color: SKILL_HEX.writing }} />
                    <span className="flex-1 text-sm font-semibold">{a.title}</span>
                    <span className={cx("text-xs", soon && !submitted ? "font-semibold text-brand" : "text-ink-muted")}>Due {fmtDate(a.dueAt, true)} · {dueIn(a.dueAt)}</span>
                    {submitted ? <StatusPill tone="green">Submitted</StatusPill> : <StatusPill tone="orange">To do</StatusPill>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
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
