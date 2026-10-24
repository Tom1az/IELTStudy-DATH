"use client";

import { useEffect, useState } from "react";
import { instructorApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { ErrorState, PageHeader, PageLoader, Select, StatCard } from "@/components/ui";
import { LearnersTable } from "@/components/studio/LearnersTable";

export default function LearnersPage() {
  const courses = useAsync(() => instructorApi.courses(), []);
  const [courseId, setCourseId] = useState("");
  useEffect(() => { if (!courseId && courses.data?.length) setCourseId((courses.data.find((c) => c.learners > 0) ?? courses.data[0]).id); }, [courses.data, courseId]);
  const { data, error, loading, reload } = useAsync(() => (courseId ? instructorApi.learners(courseId) : Promise.resolve([])), [courseId]);
  if (courses.error) return <ErrorState error={courses.error} onRetry={courses.reload} />;
  const rows = data ?? [];
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Instructor studio" title="Learners & early warning" actions={<div className="w-72"><Select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Course">{courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.learners})</option>)}</Select></div>}>
        Learners are flagged when two or more signals appear: a week without activity, progress well behind schedule, low practice scores or very low mastery.
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="At risk" value={rows.filter((r) => r.risk === "at_risk").length} accent="text-brand" />
        <StatCard label="Watch" value={rows.filter((r) => r.risk === "watch").length} accent="text-skill-r" />
        <StatCard label="On track" value={rows.filter((r) => r.risk === "on_track").length} accent="text-teal" />
      </div>
      <div className="card p-2">{(loading && !data) || !courseId ? <PageLoader /> : error ? <ErrorState error={error} onRetry={reload} /> : <LearnersTable rows={rows} />}</div>
    </div>
  );
}
