"use client";

import { useEffect, useState } from "react";
import { instructorApi } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { ErrorState, PageHeader, PageLoader, Select } from "@/components/ui";
import { CourseAnalytics } from "@/components/studio/CourseAnalytics";

export default function AnalyticsPage() {
  const courses = useAsync(() => instructorApi.courses(), []);
  const [courseId, setCourseId] = useState("");
  useEffect(() => { if (!courseId && courses.data?.length) setCourseId((courses.data.find((c) => c.learners > 0) ?? courses.data[0]).id); }, [courses.data, courseId]);
  if (courses.error) return <ErrorState error={courses.error} onRetry={courses.reload} />;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Instructor studio" title="Course analytics" actions={<div className="w-72"><Select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Course">{courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></div>}>
        Scores per practice set, the questions learners miss most and class mastery by micro-skill.
      </PageHeader>
      {courseId ? <CourseAnalytics courseId={courseId} /> : <PageLoader />}
    </div>
  );
}
