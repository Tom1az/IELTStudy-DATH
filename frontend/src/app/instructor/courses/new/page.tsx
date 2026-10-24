"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { instructorApi, ApiError } from "@/lib/api";
import { PageHeader, Select, Spinner, TextArea, TextInput, useToast } from "@/components/ui";

export default function NewCourse() {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ title: "", level: 2 as 1 | 2 | 3, tagline: "", catalogBlurb: "", hours: 20, prerequisiteText: "Level 1 or a placement score of 5.0+", outcomes: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErrs({});
    try {
      const c = await instructorApi.createCourse({ ...f, outcomes: f.outcomes.split("\n").map((x) => x.trim()).filter(Boolean) });
      toast("Course created as a draft. Add lessons next.");
      router.push(`/instructor/courses/${c.id}`);
    } catch (x) {
      if (x instanceof ApiError && x.fields) setErrs(x.fields); else toast((x as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Instructor studio" title="New course">Courses start as drafts. You can add lessons, then submit for admin review.</PageHeader>
      <form className="card space-y-5 p-6" onSubmit={submit} noValidate>
        <TextInput label="Course title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errs.title} placeholder="e.g. IELTS Speaking Booster" />
        <div className="grid gap-5 sm:grid-cols-2">
          <Select label="Level" value={f.level} onChange={(e) => { const level = Number(e.target.value) as 1 | 2 | 3; setF({ ...f, level, prerequisiteText: level === 1 ? "No prerequisite" : level === 2 ? "Level 1 or a placement score of 5.0+" : "Level 2 or a placement score of 6.5+" }); }}>
            <option value={1}>Level 1 · Foundation (Band 4.0 – 5.0)</option>
            <option value={2}>Level 2 · Intermediate (Band 5.5 – 6.5)</option>
            <option value={3}>Level 3 · Advanced (Band 7.0+)</option>
          </Select>
          <TextInput label="Estimated hours" type="number" min={1} max={200} value={f.hours} onChange={(e) => setF({ ...f, hours: Number(e.target.value) })} error={errs.hours} />
        </div>
        <TextInput label="One-line description" value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} error={errs.tagline} placeholder="Shown on the home page level card" />
        <TextArea label="Catalogue description" value={f.catalogBlurb} onChange={(e) => setF({ ...f, catalogBlurb: e.target.value })} placeholder="Shown on the Courses page" />
        <TextInput label="Prerequisite" value={f.prerequisiteText} onChange={(e) => setF({ ...f, prerequisiteText: e.target.value })} />
        <TextArea label="What learners will learn (one per line)" value={f.outcomes} onChange={(e) => setF({ ...f, outcomes: e.target.value })} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => router.back()}>Cancel</button><button className="btn-primary" disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Create course</button></div>
      </form>
    </div>
  );
}
