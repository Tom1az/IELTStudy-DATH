"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, instructorApi } from "@/lib/api";
import type { BackendCourseLevel } from "@/lib/api/backend-types";
import { PageHeader, Select, Spinner, TextArea, TextInput, useToast } from "@/components/ui";

/** Real backend: a course has a title, a description and a target level. It starts as a draft. */
export function NewCourseForm() {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ title: "", description: "", targetLevel: "intermediate" as BackendCourseLevel });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErrs({});
    try {
      const course = await instructorApi.createCourse({ title: f.title, description: f.description.trim() || null, targetLevel: f.targetLevel });
      toast("Course created as a draft. Add lessons next.");
      router.push(`/instructor/courses/${course.courseId}`);
    } catch (x) {
      if (x instanceof ApiError && x.fields) setErrs(x.fields);
      else toast((x as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Instructor studio" title="New course">Courses start as drafts. Add lessons, then submit the course for admin review.</PageHeader>
      <form className="card space-y-5 p-6" onSubmit={submit} noValidate>
        <TextInput label="Course title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errs.title} placeholder="e.g. IELTS Speaking Booster" />
        <Select label="Target level" value={f.targetLevel} onChange={(e) => setF({ ...f, targetLevel: e.target.value as BackendCourseLevel })} error={errs.targetLevel}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </Select>
        <TextArea label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={errs.description} placeholder="Shown in the course catalog" />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => router.back()}>Cancel</button>
          <button className="btn-primary" disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Create course</button>
        </div>
      </form>
    </div>
  );
}
