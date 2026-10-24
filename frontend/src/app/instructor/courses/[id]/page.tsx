"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { instructorApi, ApiError } from "@/lib/api";
import type { Lesson, SkillCategory } from "@/lib/types";
import { SKILL_CATEGORIES } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { SKILL_META, cx, fmtDate } from "@/lib/format";
import { Alert, ConfirmDialog, EmptyState, ErrorState, Modal, PageLoader, Select, Spinner, StatusPill, Tabs, TextArea, TextInput, useToast } from "@/components/ui";
import { SkillTile } from "@/components/SkillIcon";
import { CourseStatusPill } from "@/components/studio/CourseStatusPill";
import { SkillPicker } from "@/components/studio/SkillPicker";
import { LearnersTable } from "@/components/studio/LearnersTable";
import { CourseAnalytics } from "@/components/studio/CourseAnalytics";

type Tab = "lessons" | "details" | "tasks" | "learners" | "analytics";

function AddLessonModal({ courseId, skill, open, onClose, onDone }: { courseId: string; skill: SkillCategory; open: boolean; onClose: () => void; onDone: (l: Lesson) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ skill, title: "", videoMinutes: 10, videoUrl: "", freePreview: false, bodyText: "", strategy: "", skillIds: [] as string[] });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const save = async () => {
    setPending(true);
    setErrs({});
    try {
      const l = await instructorApi.createLesson(courseId, { ...f, strategy: f.strategy.split("\n").map((s) => s.trim()).filter(Boolean) });
      toast("Lesson created as a draft with an empty practice set.");
      onDone(l);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrs(e.fields); else toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add a lesson" wide footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Create lesson</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Skill" value={f.skill} onChange={(e) => setF({ ...f, skill: e.target.value as SkillCategory })}>
          {SKILL_CATEGORIES.map((s) => <option key={s} value={s}>{SKILL_META[s].label}</option>)}
        </Select>
        <TextInput label="Video length (minutes)" type="number" min={1} max={120} value={f.videoMinutes} onChange={(e) => setF({ ...f, videoMinutes: Number(e.target.value) })} error={errs.videoMinutes} />
        <div className="sm:col-span-2"><TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errs.title} placeholder="e.g. Diagram labelling" /></div>
        <div className="sm:col-span-2"><TextInput label="Video URL (optional)" value={f.videoUrl} onChange={(e) => setF({ ...f, videoUrl: e.target.value })} error={errs.videoUrl} placeholder="https://storage…/lesson.mp4" hint="Upload to the course storage bucket and paste the public link. Without a video, learners see the scripted slide player." /></div>
        <div className="sm:col-span-2"><TextArea label="Overview text" value={f.bodyText} onChange={(e) => setF({ ...f, bodyText: e.target.value })} /></div>
        <div className="sm:col-span-2"><TextArea label="Key strategy (one step per line)" value={f.strategy} onChange={(e) => setF({ ...f, strategy: e.target.value })} /></div>
        <div className="sm:col-span-2"><SkillPicker value={f.skillIds} onChange={(v) => setF({ ...f, skillIds: v })} prefer={f.skill} error={errs.skillIds} /></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.freePreview} onChange={(e) => setF({ ...f, freePreview: e.target.checked })} className="h-4 w-4 accent-navy" /> Free preview (visible without enrolling)</label>
      </div>
    </Modal>
  );
}

function AssignmentModal({ courseId, lessons, open, onClose, onDone }: { courseId: string; lessons: Lesson[]; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const writing = lessons.filter((l) => l.skill === "writing");
  const [f, setF] = useState({ title: "", task: "Task 2" as "Task 1" | "Task 2", lessonId: writing[0]?.id ?? "", prompt: "", minWords: 250, due: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const save = async () => {
    setPending(true);
    try {
      await instructorApi.createAssignment(courseId, {
        title: f.title, task: f.task, lessonId: f.lessonId, prompt: f.prompt, minWords: f.minWords, dueAt: f.due ? new Date(f.due).toISOString() : "", maxScore: 9,
        rubric: [
          { criterion: f.task === "Task 1" ? "Task Achievement" : "Task Response", description: f.task === "Task 1" ? "Clear overview, key features selected and supported with data." : "Clear position developed throughout with relevant support." },
          { criterion: "Coherence & Cohesion", description: "Logical organisation, paragraphing and linking." },
          { criterion: "Lexical Resource", description: "Range, precision and collocation." },
          { criterion: "Grammatical Range & Accuracy", description: "Variety and accuracy of structures." },
        ],
      });
      toast("Writing task created. Enrolled learners were notified.");
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrs(e.fields); else toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="New writing task" wide footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Create task</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errs.title} /></div>
        <Select label="Task type" value={f.task} onChange={(e) => setF({ ...f, task: e.target.value as "Task 1" | "Task 2", minWords: e.target.value === "Task 1" ? 150 : 250 })}><option>Task 1</option><option>Task 2</option></Select>
        <Select label="Attach to lesson" value={f.lessonId} onChange={(e) => setF({ ...f, lessonId: e.target.value })}>{writing.map((l) => <option key={l.id} value={l.id}>{l.order}. {l.title}</option>)}</Select>
        <TextInput label="Minimum words" type="number" value={f.minWords} onChange={(e) => setF({ ...f, minWords: Number(e.target.value) })} />
        <TextInput label="Due date" type="datetime-local" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} error={errs.dueAt} />
        <div className="sm:col-span-2"><TextArea label="Task prompt" value={f.prompt} onChange={(e) => setF({ ...f, prompt: e.target.value })} error={errs.prompt} /></div>
      </div>
    </Modal>
  );
}

export default function ManageCourse() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => instructorApi.course(id), [id]);
  const learners = useAsync(() => instructorApi.learners(id), [id]);
  const [tab, setTab] = useState<Tab>("lessons");
  const [adding, setAdding] = useState<SkillCategory | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState<Lesson | null>(null);
  const [busy, setBusy] = useState("");
  const [details, setDetails] = useState<Record<string, string> | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const { course, lessons, assignments } = data;
  const d = details ?? { title: course.title, tagline: course.tagline, catalogBlurb: course.catalogBlurb, hours: String(course.hours), prerequisiteText: course.prerequisiteText, outcomes: course.outcomes.join("\n"), includes: course.includes.join("\n") };

  const act = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key);
    try { await fn(); toast(msg); await reload(true); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(""); }
  };

  const saveDetails = async () => {
    setErrs({});
    try {
      await instructorApi.updateCourse(course.id, { title: d.title, tagline: d.tagline, catalogBlurb: d.catalogBlurb, hours: Number(d.hours), prerequisiteText: d.prerequisiteText, outcomes: d.outcomes.split("\n").map((x) => x.trim()).filter(Boolean), includes: d.includes.split("\n").map((x) => x.trim()).filter(Boolean) });
      toast("Course details saved.");
      setDetails(null);
      reload(true);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrs(e.fields); else toast((e as Error).message, "error");
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/instructor/courses" className="text-sm font-semibold text-ink-muted hover:text-ink">← Courses</Link>
      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2"><CourseStatusPill status={course.status} /><span className="text-sm text-ink-muted">Level {course.level} · {course.bandRange} · updated {fmtDate(course.updatedAt)}</span></div>
          <h1 className="mt-2 font-serif text-[34px] font-bold leading-tight">{course.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/courses/${course.slug}`} className="btn-outline"><Eye className="h-4 w-4" /> View as learner</Link>
          {(course.status === "draft" || course.status === "rejected") && <button className="btn-primary" disabled={busy === "submit"} onClick={() => act("submit", () => instructorApi.submitForReview(course.id), "Submitted for review. An admin will check it.")}><Send className="h-4 w-4" /> Submit for review</button>}
          {course.status === "pending" && <span className="btn cursor-default bg-skill-r-bg text-skill-r-ink">Waiting for admin review</span>}
          {course.status === "published" && <button className="btn-outline" disabled={busy === "vis"} onClick={() => act("vis", () => instructorApi.setVisibility(course.id, false), "Course hidden from the catalogue. Enrolled learners keep access.")}><EyeOff className="h-4 w-4" /> Hide course</button>}
          {course.status === "hidden" && <button className="btn-primary" disabled={busy === "vis"} onClick={() => act("vis", () => instructorApi.setVisibility(course.id, true), "Course published.")}><Eye className="h-4 w-4" /> Publish course</button>}
        </div>
      </div>
      {course.status === "rejected" && course.reviewFeedback && <Alert tone="error" className="mt-4"><strong>Changes requested:</strong> {course.reviewFeedback}</Alert>}

      <Tabs className="mt-6" value={tab} onChange={setTab} tabs={[
        { id: "lessons", label: `Lessons (${lessons.length})` },
        { id: "details", label: "Details" },
        { id: "tasks", label: `Writing tasks (${assignments.length})` },
        { id: "learners", label: `Learners${learners.data ? ` (${learners.data.length})` : ""}` },
        { id: "analytics", label: "Analytics" },
      ]} />

      <div className="pt-6">
        {tab === "lessons" && (
          <div className="space-y-6">
            {SKILL_CATEGORIES.map((s) => {
              const ls = lessons.filter((l) => l.skill === s).sort((a, b) => a.order - b.order);
              return (
                <section key={s} className="overflow-hidden rounded-2xl border border-line bg-white">
                  <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                    <SkillTile skill={s} size={32} />
                    <h2 className="flex-1 font-serif text-lg font-bold">{SKILL_META[s].label} <span className="text-sm font-normal text-ink-muted">· {ls.length} lessons</span></h2>
                    <button className="btn-outline btn-sm" onClick={() => setAdding(s)}><Plus className="h-3.5 w-3.5" /> Add lesson</button>
                  </div>
                  {ls.length === 0 ? <p className="px-4 py-5 text-sm text-ink-muted">No {SKILL_META[s].label.toLowerCase()} lessons yet.</p> : (
                    <ul className="divide-y divide-line">
                      {ls.map((l, i) => (
                        <li key={l.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
                          <span className="w-6 text-sm font-semibold text-ink-muted">{l.order}</span>
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{l.title}{l.freePreview && <StatusPill tone="orange">Preview</StatusPill>}{l.status !== "published" && <StatusPill tone={l.status === "draft" ? "gray" : "violet"}>{l.status}</StatusPill>}</p>
                            <p className="text-xs text-ink-muted">{l.videoMinutes} min video · {l.questions} questions · {l.resources.length} resources · {l.skillIds.join(", ")}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button className="rounded-lg p-2 hover:bg-sand disabled:opacity-30" disabled={i === 0 || !!busy} onClick={() => act(`m${l.id}`, () => instructorApi.moveLesson(l.id, -1), "Order updated.")} aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                            <button className="rounded-lg p-2 hover:bg-sand disabled:opacity-30" disabled={i === ls.length - 1 || !!busy} onClick={() => act(`m${l.id}`, () => instructorApi.moveLesson(l.id, 1), "Order updated.")} aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                            {l.status === "published" ? (
                              <button className="btn-ghost btn-sm" onClick={() => act(`s${l.id}`, () => instructorApi.setLessonStatus(l.id, "hidden"), "Lesson hidden from learners.")}><EyeOff className="h-3.5 w-3.5" /> Hide</button>
                            ) : (
                              <button className="btn-ghost btn-sm text-teal" onClick={() => act(`s${l.id}`, () => instructorApi.setLessonStatus(l.id, "published"), "Lesson published. Enrolled learners were notified.")}><Eye className="h-3.5 w-3.5" /> Publish</button>
                            )}
                            <Link href={`/instructor/lessons/${l.id}`} className="btn-outline btn-sm"><Pencil className="h-3.5 w-3.5" /> Edit</Link>
                            <button className="rounded-lg p-2 text-ink-muted hover:bg-sand hover:text-danger" onClick={() => setDeleting(l)} aria-label="Delete lesson"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {tab === "details" && (
          <form className="card grid gap-5 p-6 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); saveDetails(); }}>
            <div className="md:col-span-2"><TextInput label="Title" value={d.title} onChange={(e) => setDetails({ ...d, title: e.target.value })} error={errs.title} /></div>
            <TextInput label="One-line description" value={d.tagline} onChange={(e) => setDetails({ ...d, tagline: e.target.value })} />
            <TextInput label="Estimated hours" type="number" value={d.hours} onChange={(e) => setDetails({ ...d, hours: e.target.value })} />
            <div className="md:col-span-2"><TextArea label="Catalogue description" value={d.catalogBlurb} onChange={(e) => setDetails({ ...d, catalogBlurb: e.target.value })} /></div>
            <div className="md:col-span-2"><TextInput label="Prerequisite" value={d.prerequisiteText} onChange={(e) => setDetails({ ...d, prerequisiteText: e.target.value })} /></div>
            <TextArea label="What you will learn (one per line)" value={d.outcomes} onChange={(e) => setDetails({ ...d, outcomes: e.target.value })} className="min-h-[150px]" />
            <TextArea label="This course includes (one per line)" value={d.includes} onChange={(e) => setDetails({ ...d, includes: e.target.value })} className="min-h-[150px]" />
            <div className="flex justify-end gap-2 md:col-span-2">{details && <button type="button" className="btn-ghost" onClick={() => setDetails(null)}>Discard changes</button>}<button className="btn-primary">Save details</button></div>
          </form>
        )}

        {tab === "tasks" && (
          <div>
            <div className="mb-4 flex justify-end"><button className="btn-primary" onClick={() => setAssigning(true)} disabled={!lessons.some((l) => l.skill === "writing")}><Plus className="h-4 w-4" /> New writing task</button></div>
            <div className="overflow-hidden rounded-2xl border border-line bg-white">
              {assignments.length === 0 ? <EmptyState title="No writing tasks yet">Writing tasks let learners upload a file or paste an essay for you to grade.</EmptyState> : (
                <table className="table-base">
                  <thead><tr><th>Task</th><th>Lesson</th><th>Due</th><th /></tr></thead>
                  <tbody>{assignments.map((a) => (
                    <tr key={a.id}><td><p className="font-semibold">{a.title}</p><p className="text-xs text-ink-muted">{a.task} · {a.minWords}+ words</p></td><td className="text-ink-muted">{lessons.find((l) => l.id === a.lessonId)?.title}</td><td className={cx(Date.parse(a.dueAt) < Date.now() ? "text-ink-soft" : "font-semibold")}>{fmtDate(a.dueAt, true)}</td><td><Link href={`/instructor/grading?assignment=${a.id}`} className="font-semibold text-brand hover:underline">Submissions</Link></td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === "learners" && <div className="card p-2">{learners.loading && !learners.data ? <PageLoader /> : <LearnersTable rows={learners.data ?? []} />}</div>}
        {tab === "analytics" && <CourseAnalytics courseId={course.id} />}
      </div>

      {adding && <AddLessonModal open courseId={course.id} skill={adding} onClose={() => setAdding(null)} onDone={() => { setAdding(null); reload(true); }} />}
      {assigning && <AssignmentModal open courseId={course.id} lessons={lessons} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); reload(true); }} />}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} danger title="Delete this lesson?" confirmLabel="Delete lesson" pending={!!busy}
        onConfirm={() => { const l = deleting!; setDeleting(null); act("del", () => instructorApi.deleteLesson(l.id), "Lesson deleted."); }}
        body={<>“{deleting?.title}” and its practice set will be removed. If learners already have progress on it, deleting is blocked — hide it instead.</>} />
    </div>
  );
}
