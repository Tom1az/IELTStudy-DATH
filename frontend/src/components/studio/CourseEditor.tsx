"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArrowDown, ArrowUp, Eye, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { ApiError, instructorApi } from "@/lib/api";
import { isEditable } from "@/lib/api/instructor";
import type { BackendCourse, BackendCourseLevel, BackendLesson } from "@/lib/api/backend-types";
import { buildSyllabus, toCourse } from "@/lib/api/mappers";
import { useAsync } from "@/lib/hooks";
import { SKILL_META } from "@/lib/format";
import { Alert, ConfirmDialog, ErrorState, Modal, PageLoader, Select, Spinner, Tabs, TextArea, TextInput, useToast } from "@/components/ui";
import { SkillTile } from "@/components/SkillIcon";
import { CourseStatusPill } from "@/components/studio/CourseStatusPill";
import { SkillPicker } from "@/components/studio/SkillPicker";

type Tab = "lessons" | "details";

/** The next free position among lessons of the same kind. */
function nextOrderIndex(lessons: BackendLesson[], kind: BackendLesson["kind"]) {
  let max = -1;
  for (const l of lessons) {
    if (l.kind === kind && l.orderIndex > max) max = l.orderIndex;
  }
  return max + 1;
}

function AddLessonModal({ course, lessons, onClose, onDone }: { course: BackendCourse; lessons: BackendLesson[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: "", kind: "core" as BackendLesson["kind"], content: "", skillIds: [] as string[] });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const save = async () => {
    setPending(true);
    setErrs({});
    try {
      await instructorApi.createLesson(course.courseId, {
        title: f.title,
        content: f.content.trim() || null,
        kind: f.kind,
        orderIndex: nextOrderIndex(lessons, f.kind),
        // Lesson tags say what the lesson teaches; unlike questions, their weights don't need to add up to 1
        skills: f.skillIds.map((id) => ({ skillId: Number(id), weight: 1 })),
      });
      toast("Lesson created.");
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrs(e.fields);
      else toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Add a lesson" wide footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Create lesson</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errs.title} placeholder="e.g. Diagram labelling" />
        <Select label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as BackendLesson["kind"] })}>
          <option value="core">Core: part of the course sequence</option>
          <option value="remedial">Remedial: only reached through recommendations</option>
        </Select>
        <div className="sm:col-span-2"><TextArea label="Lesson text (Markdown)" value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} error={errs.content} /></div>
        <div className="sm:col-span-2"><SkillPicker value={f.skillIds} onChange={(v) => setF({ ...f, skillIds: v })} error={errs.skills} /></div>
      </div>
    </Modal>
  );
}

function DetailsForm({ course, onSaved }: { course: BackendCourse; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: course.title, description: course.description ?? "", targetLevel: course.targetLevel });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const editable = isEditable(course);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErrs({});
    try {
      await instructorApi.updateCourse(course.courseId, { title: f.title, description: f.description.trim() || null, targetLevel: f.targetLevel });
      toast("Course details saved.");
      onSaved();
    } catch (x) {
      if (x instanceof ApiError && x.fields) setErrs(x.fields);
      else toast((x as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="card grid gap-5 p-6" onSubmit={save} noValidate>
      <TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errs.title} disabled={!editable} />
      <Select label="Target level" value={f.targetLevel} onChange={(e) => setF({ ...f, targetLevel: e.target.value as BackendCourseLevel })} disabled={!editable}>
        <option value="beginner">Beginner</option>
        <option value="intermediate">Intermediate</option>
        <option value="advanced">Advanced</option>
      </Select>
      <TextArea label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={errs.description} disabled={!editable} />
      {editable && <div className="flex justify-end"><button className="btn-primary" disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Save details</button></div>}
    </form>
  );
}

function LessonRow({ lesson, label, canMoveUp, canMoveDown, onMove, onDelete, editable, busy }: {
  lesson: BackendLesson; label: string; canMoveUp: boolean; canMoveDown: boolean; onMove: (dir: -1 | 1) => void; onDelete: () => void; editable: boolean; busy: boolean;
}) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
      <span className="w-6 text-sm font-semibold text-ink-muted">{label}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{lesson.title}</p>
        <p className="text-xs text-ink-muted">{lesson.skills.map((s) => s.name).join(", ")}</p>
      </div>
      <div className="flex items-center gap-1">
        {editable && (
          <>
            <button className="rounded-lg p-2 hover:bg-line/50 disabled:opacity-30" disabled={!canMoveUp || busy} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
            <button className="rounded-lg p-2 hover:bg-line/50 disabled:opacity-30" disabled={!canMoveDown || busy} onClick={() => onMove(1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
          </>
        )}
        <Link href={`/instructor/lessons/${lesson.lessonId}`} className="btn-outline btn-sm"><Pencil className="h-3.5 w-3.5" /> {editable ? "Edit" : "Open"}</Link>
        {editable && <button className="rounded-lg p-2 text-ink-muted hover:bg-line/50 hover:text-danger" onClick={onDelete} aria-label="Delete lesson"><Trash2 className="h-4 w-4" /></button>}
      </div>
    </li>
  );
}

/** Real backend: course details, the review flow, and the course's core and remedial lessons. */
export function CourseEditor({ courseId }: { courseId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => instructorApi.getCourse(courseId), [courseId]);
  const [tab, setTab] = useState<Tab>("lessons");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<BackendLesson | null>(null);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const [busy, setBusy] = useState("");

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const { course, lessons, categories } = data;
  const editable = isEditable(course);
  const sections = buildSyllabus(lessons, categories);
  const remedial = lessons.filter((l) => l.kind === "remedial");

  const act = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key);
    try {
      await fn();
      toast(msg);
      await reload(true);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/instructor/courses" className="text-sm font-semibold text-ink-muted hover:text-ink">← Courses</Link>
      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2"><CourseStatusPill status={toCourse(course).status} /><span className="text-sm capitalize text-ink-muted">{course.targetLevel}</span></div>
          <h1 className="mt-2 text-[34px] font-extrabold leading-tight">{course.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/courses/${course.courseId}`} className="btn-outline"><Eye className="h-4 w-4" /> View as learner</Link>
          {editable && (
            <button className="btn-primary" disabled={!!busy} onClick={() => act("submit", () => instructorApi.changeStatus(course.courseId, "submit"), "Submitted for review. An admin will check it.")}>
              <Send className="h-4 w-4" /> Submit for review
            </button>
          )}
          {(course.status === "pending_review" || course.status === "approved") && (
            <button className="btn-outline" disabled={!!busy} onClick={() => act("withdraw", () => instructorApi.changeStatus(course.courseId, "withdraw"), "Course is a draft again. You can edit it now.")}>
              <Undo2 className="h-4 w-4" /> Withdraw to edit
            </button>
          )}
          {course.status !== "archived" && <button className="btn-ghost" disabled={!!busy} onClick={() => setConfirm("archive")}><Archive className="h-4 w-4" /> Archive</button>}
          {course.status === "draft" && <button className="btn-ghost text-danger" disabled={!!busy} onClick={() => setConfirm("delete")}><Trash2 className="h-4 w-4" /> Delete</button>}
        </div>
      </div>

      {course.status === "rejected" && course.reviewFeedback && <Alert tone="error" className="mt-4"><strong>Changes requested:</strong> {course.reviewFeedback}</Alert>}
      {course.status === "approved" && course.reviewFeedback && <Alert tone="success" className="mt-4"><strong>Reviewer note:</strong> {course.reviewFeedback}</Alert>}
      {!editable && course.status !== "archived" && (
        <Alert tone="info" className="mt-4">
          {course.status === "pending_review" ? "This course is waiting for review" : "This course is approved"}, so its content is locked. Withdraw it to draft to make changes, then submit it again.
        </Alert>
      )}

      <Tabs className="mt-6" value={tab} onChange={setTab} tabs={[{ id: "lessons", label: `Lessons (${lessons.length})` }, { id: "details", label: "Details" }]} />
      <div className="pt-6">
        {tab === "lessons" && (
          <div className="space-y-6">
            {editable && <div className="flex justify-end"><button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add lesson</button></div>}
            {sections.length === 0 && <p className="card p-5 text-sm text-ink-muted">No core lessons yet. A course needs at least one core lesson before it can be submitted.</p>}
            {sections.map((section) => (
              <section key={section.skill} className="overflow-hidden rounded-2xl border border-line bg-white">
                <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                  <SkillTile skill={section.skill} size={32} />
                  <h2 className="flex-1 text-lg font-extrabold">{SKILL_META[section.skill].label} <span className="text-sm font-normal text-ink-muted">· {section.entries.length} lessons</span></h2>
                </div>
                <ul className="divide-y divide-line">
                  {section.entries.map((entry, i) => (
                    <LessonRow key={entry.lesson.lessonId} lesson={entry.lesson} label={String(entry.order)} editable={editable} busy={!!busy}
                      canMoveUp={i > 0} canMoveDown={i < section.entries.length - 1}
                      // Moving swaps the position with the neighbour in the same skill section
                      onMove={(dir) => act("move", () => instructorApi.swapOrder(entry.lesson, section.entries[i + dir].lesson), "Order updated.")}
                      onDelete={() => setDeleting(entry.lesson)} />
                  ))}
                </ul>
              </section>
            ))}
            <section className="overflow-hidden rounded-2xl border border-line bg-white">
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-lg font-extrabold">Remedial lessons <span className="text-sm font-normal text-ink-muted">· recommended to learners whose mastery of the tagged skills is below 0.65</span></h2>
              </div>
              {remedial.length === 0 ? <p className="px-4 py-5 text-sm text-ink-muted">No remedial lessons yet.</p> : (
                <ul className="divide-y divide-line">
                  {remedial.map((l) => <LessonRow key={l.lessonId} lesson={l} label="R" editable={editable} busy={!!busy} canMoveUp={false} canMoveDown={false} onMove={() => {}} onDelete={() => setDeleting(l)} />)}
                </ul>
              )}
            </section>
          </div>
        )}
        {tab === "details" && <DetailsForm key={course.updatedAt} course={course} onSaved={() => reload(true)} />}
      </div>

      {adding && <AddLessonModal course={course} lessons={lessons} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(true); }} />}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} danger title="Delete this lesson?" confirmLabel="Delete lesson"
        onConfirm={() => { const l = deleting!; setDeleting(null); act("delete-lesson", () => instructorApi.deleteLesson(l.lessonId), "Lesson deleted."); }}
        body={<>“{deleting?.title}”, its passages and its quizzes will be removed. This is blocked once learners have attempted its quizzes.</>} />
      <ConfirmDialog open={confirm === "archive"} onClose={() => setConfirm(null)} danger title="Archive this course?" confirmLabel="Archive"
        onConfirm={() => { setConfirm(null); act("archive", () => instructorApi.changeStatus(course.courseId, "archive"), "Course archived."); }}
        body={<>The course leaves the catalog for good. Learner history is kept.</>} />
      <ConfirmDialog open={confirm === "delete"} onClose={() => setConfirm(null)} danger title="Delete this course?" confirmLabel="Delete course"
        onConfirm={async () => {
          setConfirm(null);
          try {
            await instructorApi.deleteCourse(course.courseId);
            toast("Course deleted.");
            router.push("/instructor/courses");
          } catch (e) {
            toast((e as Error).message, "error");
          }
        }}
        body={<>Only a draft that no learner has enrolled in can be deleted.</>} />
    </div>
  );
}
