"use client";

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { gradingApi } from "@/lib/api";
import type { InstructorLearner } from "@/lib/api";
import { useAsync, useDebounced } from "@/lib/hooks";
import { cx, timeAgo } from "@/lib/format";
import { Avatar, EmptyState, ErrorState, PageHeader, PageLoader, ProgressBar, Select, StatCard } from "@/components/ui";
import { NotAvailable } from "@/components/NotAvailable";

/**
 * Who is on this instructor's courses and how far they have got. Least progress first:
 * the list answers "who is stuck?", not "who is doing well?".
 *
 * The list arrives in one call and is filtered here, so typing in the search box doesn't
 * cost a round trip and the course dropdown keeps every course while you narrow the table.
 */

/** Under a third of the way through a course is the signal worth acting on. */
const STALLED_PERCENT = 33;

function CoursesCell({ courses }: { courses: InstructorLearner["courses"] }) {
  return (
    <ul className="flex min-w-[220px] flex-col gap-2.5">
      {courses.map((c) => (
        <li key={c.id}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-semibold">{c.title}</span>
            <span className="shrink-0 tabular-nums text-ink-muted">{c.done}/{c.total}</span>
          </div>
          <ProgressBar value={c.percent} color={c.percent < STALLED_PERCENT ? "bg-skill-r" : "bg-brand"} height="h-1.5" label={`${c.title} progress`} />
        </li>
      ))}
    </ul>
  );
}

export default function LearnersPage() {
  const [q, setQ] = useState("");
  const [courseId, setCourseId] = useState("all");
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useAsync(() => gradingApi.learners(), []);

  const courses = useMemo(() => {
    const map = new Map<string, string>();
    for (const learner of data ?? []) {
      for (const c of learner.courses) map.set(c.id, c.title);
    }
    return Array.from(map, ([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  }, [data]);

  const rows = useMemo(() => {
    const needle = dq.trim().toLowerCase();
    const list: InstructorLearner[] = [];
    for (const learner of data ?? []) {
      if (needle && !learner.name.toLowerCase().includes(needle) && !learner.email.toLowerCase().includes(needle)) continue;
      if (courseId === "all") {
        list.push(learner);
        continue;
      }
      // Filtered to one course: show that course's progress only, and drop everyone else
      const only = learner.courses.filter((c) => c.id === courseId);
      if (only.length > 0) list.push({ ...learner, courses: only, overallPercent: only[0].percent });
    }
    return list.sort((a, b) => a.overallPercent - b.overallPercent || a.name.localeCompare(b.name));
  }, [data, dq, courseId]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <PageLoader label="Loading learners…" />;
  if (!data) {
    return (
      <NotAvailable eyebrow="Instructor studio" title="Learners">
        The backend has no learner list for instructors yet. This page starts working as soon as <code>GET /instructor/learners</code> answers.
      </NotAvailable>
    );
  }

  const stalled = rows.filter((l) => l.overallPercent < STALLED_PERCENT).length;
  const averagePercent = rows.length ? Math.round(rows.reduce((sum, l) => sum + l.overallPercent, 0) / rows.length) : 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Instructor studio" title="Learners">
        Everyone enrolled in your courses, the slowest first, so the people who need a nudge are at the top.
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Learners" value={rows.length} />
        <StatCard label="Average progress" value={`${averagePercent}%`} />
        <StatCard label="Under a third done" value={stalled} accent={stalled > 0 ? "text-skill-r" : undefined} sub="Worth a message" />
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_240px]">
        <label className="relative">
          <span className="sr-only">Search learners</span>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input className="input pl-9" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Course">
          <option value="all">All my courses</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select>
      </div>

      <div className={cx("overflow-x-auto rounded-2xl border border-line bg-white transition-opacity duration-200", loading && "opacity-60")}>
        {rows.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No learners match">
            Nobody has enrolled in this course yet, or the search is too narrow.
          </EmptyState>
        ) : (
          <table className="table-base min-w-[760px]">
            <thead><tr><th>Learner</th><th>Progress</th><th>Overall</th><th>Quizzes done</th><th>Last active</th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={l.name} size={34} />
                      <div className="min-w-0"><p className="truncate font-semibold">{l.name}</p><p className="truncate text-xs text-ink-muted">{l.email}</p></div>
                    </div>
                  </td>
                  <td><CoursesCell courses={l.courses} /></td>
                  <td className={cx("whitespace-nowrap font-extrabold tabular-nums", l.overallPercent < STALLED_PERCENT ? "text-skill-r" : "text-brand")}>{l.overallPercent}%</td>
                  <td className="tabular-nums text-ink-muted">{l.attempts}</td>
                  <td className="whitespace-nowrap text-ink-muted">{l.lastActiveAt ? timeAgo(l.lastActiveAt) : "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
