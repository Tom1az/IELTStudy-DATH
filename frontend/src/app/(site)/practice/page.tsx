"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Clock, PlayCircle, RotateCcw } from "lucide-react";
import { practiceApi } from "@/lib/api";
import type { SkillCategory } from "@/lib/types";
import { SKILL_CATEGORIES } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { RequireRole } from "@/lib/auth-context";
import { SKILL_META, cx, timeAgo } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, Skeleton, SkillChip } from "@/components/ui";

type Filter = SkillCategory | "all";
type Status = "all" | "todo" | "done" | "progress";

function PracticeList() {
  const [skill, setSkill] = useState<Filter>("all");
  const [status, setStatus] = useState<Status>("all");
  const { data, error, loading, reload } = useAsync(() => practiceApi.list({ skill }), [skill]);

  const items = (data ?? []).filter((x) => status === "all" || (status === "done" ? x.attempts > 0 : status === "progress" ? x.inProgress : x.attempts === 0));
  const groups = Array.from(new Set(items.map((i) => i.course.id))).map((id) => ({ course: items.find((i) => i.course.id === id)!.course, items: items.filter((i) => i.course.id === id) }));

  return (
    <div className="container pb-16 pt-10 md:pt-12">
      <PageHeader eyebrow="Practice" title="Every quiz in your courses">
        Lesson quizzes from the courses you are enrolled in. Quizzes in lessons you haven&apos;t unlocked yet appear once you reach them.
      </PageHeader>

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by skill">
          {(["all", ...SKILL_CATEGORIES] as Filter[]).map((s) => (
            <button key={s} onClick={() => setSkill(s)} aria-pressed={skill === s}
              className={cx("h-[38px] rounded-full border-[1.5px] border-navy px-4 text-sm font-semibold", skill === s ? "bg-navy text-white" : "text-navy hover:bg-white")}>
              {s === "all" ? "All skills" : SKILL_META[s].label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Show
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className="input h-[38px] w-auto py-1.5">
            <option value="all">All quizzes</option>
            <option value="todo">Not attempted</option>
            <option value="progress">In progress</option>
            <option value="done">Attempted</option>
          </select>
        </label>
      </div>

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {data && groups.length === 0 && (
        <div className="card"><EmptyState title={data.length ? "No quizzes match this filter" : "No quizzes yet"} action={!data.length ? <Link href="/courses" className="btn-primary">Browse courses</Link> : undefined}>{data.length ? "Try another filter." : "Enroll in a course to see its quizzes."}</EmptyState></div>
      )}

      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.course.id} aria-label={g.course.levelName}>
            <h2 className="mb-3 font-serif text-2xl font-bold">Level {g.course.level} · {g.course.levelName}</h2>
            <div className="overflow-hidden rounded-2xl border border-line bg-white">
              <ul className="divide-y divide-line">
                {g.items.map((it) => (
                  <li key={it.quiz.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <SkillChip skill={it.quiz.skill} />
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold">{it.quiz.title}</p>
                        <p className="flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
                          <span>{it.quiz.questions} questions</span>
                          {it.quiz.minutes > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {it.quiz.minutes} min</span>}
                          <span className="truncate">After “{it.lessonTitle}”</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 sm:justify-end">
                      {it.last ? (
                        <span className="text-right text-xs text-ink-muted">
                          <span className="block text-sm font-semibold text-ink tabular-nums">Best {it.best} / {it.quiz.questions}</span>
                          {it.attempts} attempt{it.attempts > 1 ? "s" : ""} · {timeAgo(it.last.at)}
                        </span>
                      ) : it.inProgress ? (
                        <span className="text-xs font-semibold text-skill-r">In progress</span>
                      ) : null}
                      <div className="flex gap-2">
                        {it.last && <Link href={`/practice/result/${it.last.attemptId}`} className="btn-ghost btn-sm">Review</Link>}
                        <Link href={`/practice/${it.quiz.id}`} className={it.inProgress ? "btn-primary btn-sm" : it.last ? "btn-outline btn-sm" : "btn-dark btn-sm"}>
                          {it.inProgress ? <><PlayCircle className="h-3.5 w-3.5" /> Resume</> : it.last ? <><RotateCcw className="h-3.5 w-3.5" /> Retake</> : "Start"}
                        </Link>
                      </div>
                      {it.best !== null && it.best === it.quiz.questions && <CheckCircle2 className="h-4 w-4 text-teal" aria-label="Perfect score" />}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function PracticePage() {
  return (
    <RequireRole roles={["learner"]}>
      <PracticeList />
    </RequireRole>
  );
}
