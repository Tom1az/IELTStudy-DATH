"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { instructorApi, ApiError } from "@/lib/api";
import type { Lesson, Passage, PracticeSet, Question } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { SKILL_META, cx } from "@/lib/format";
import { ConfirmDialog, ErrorState, PageLoader, Spinner, StatusPill, Tabs, TextArea, TextInput, useToast } from "@/components/ui";
import { SkillPicker } from "@/components/studio/SkillPicker";
import { QuestionModal } from "@/components/studio/QuestionModal";

type Tab = "content" | "practice" | "resources";
const TYPE_LABEL = { tfng: "T/F/NG", ynng: "Y/N/NG", mcq: "Multiple choice", gap: "Gap fill", heading: "Headings" };

function ContentForm({ lesson, onSaved }: { lesson: Lesson; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: lesson.title, shortTitle: lesson.shortTitle ?? "", videoMinutes: lesson.videoMinutes, videoUrl: lesson.videoUrl ?? "", freePreview: lesson.freePreview, bodyText: lesson.bodyText ?? "", strategy: lesson.strategy.join("\n"), transcript: lesson.transcript, skillIds: lesson.skillIds });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErrs({});
    try {
      await instructorApi.updateLesson(lesson.id, { ...f, shortTitle: f.shortTitle || undefined, videoUrl: f.videoUrl || undefined, strategy: f.strategy.split("\n").map((s) => s.trim()).filter(Boolean) });
      toast("Lesson saved.");
      onSaved();
    } catch (x) {
      if (x instanceof ApiError && x.fields) setErrs(x.fields); else toast((x as Error).message, "error");
    } finally {
      setPending(false);
    }
  };
  return (
    <form className="card grid gap-5 p-6 md:grid-cols-2" onSubmit={save} noValidate>
      <div className="md:col-span-2"><TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errs.title} /></div>
      <TextInput label="Short title for the sidebar (optional)" value={f.shortTitle} onChange={(e) => setF({ ...f, shortTitle: e.target.value })} />
      <TextInput label="Video length (minutes)" type="number" value={f.videoMinutes} onChange={(e) => setF({ ...f, videoMinutes: Number(e.target.value) })} />
      <div className="md:col-span-2"><TextInput label="Video URL" value={f.videoUrl} onChange={(e) => setF({ ...f, videoUrl: e.target.value })} error={errs.videoUrl} placeholder="https://…/lesson.mp4" hint="Leave empty to use the scripted slide player generated from the strategy and transcript." /></div>
      <div className="md:col-span-2"><TextArea label="Overview text" value={f.bodyText} onChange={(e) => setF({ ...f, bodyText: e.target.value })} /></div>
      <TextArea label="Key strategy (one step per line)" value={f.strategy} onChange={(e) => setF({ ...f, strategy: e.target.value })} className="min-h-[160px]" />
      <TextArea label="Transcript / captions" value={f.transcript} onChange={(e) => setF({ ...f, transcript: e.target.value })} className="min-h-[160px]" hint="Paragraphs separated by a blank line become seekable transcript blocks." />
      <div className="md:col-span-2"><SkillPicker value={f.skillIds} onChange={(v) => setF({ ...f, skillIds: v })} prefer={lesson.skill} error={errs.skillIds} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.freePreview} onChange={(e) => setF({ ...f, freePreview: e.target.checked })} className="h-4 w-4 accent-navy" /> Free preview lesson</label>
      <div className="flex justify-end md:col-span-1"><button className="btn-primary" disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Save lesson</button></div>
    </form>
  );
}

function PassageEditor({ set, onSaved }: { set: PracticeSet; onSaved: () => void }) {
  const toast = useToast();
  const [p, setP] = useState<Passage>(set.passage);
  const [title, setTitle] = useState(set.title);
  const [minutes, setMinutes] = useState(set.minutes);
  const [pending, setPending] = useState(false);
  const listening = p.kind === "listening";
  const save = async () => {
    setPending(true);
    try {
      await instructorApi.updateSet(set.id, { title, minutes, passage: p });
      toast("Practice set saved.");
      onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="card p-6">
      <div className="grid gap-4 md:grid-cols-[1fr_160px]">
        <TextInput label={`Practice set ${set.code} title`} value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextInput label="Time limit (minutes)" type="number" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        <div className="md:col-span-2"><TextInput label={listening ? "Recording title" : "Passage title"} value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} /></div>
      </div>
      <p className="label mt-5">{listening ? "Instructions shown above the player" : "Paragraphs"}</p>
      <div className="space-y-2.5">
        {p.paragraphs.map((para, i) => (
          <div key={i} className="flex gap-2">
            {!listening && <input className="input w-14 text-center" value={para.label ?? ""} onChange={(e) => setP({ ...p, paragraphs: p.paragraphs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} aria-label="Paragraph label" />}
            <textarea className="input min-h-[80px] flex-1" value={para.text} onChange={(e) => setP({ ...p, paragraphs: p.paragraphs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} aria-label={`Paragraph ${i + 1}`} />
            <button className="self-start rounded p-2 text-ink-muted hover:text-danger" onClick={() => setP({ ...p, paragraphs: p.paragraphs.filter((_, j) => j !== i) })} aria-label="Remove paragraph"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <button className="mt-2 flex items-center gap-1 text-sm font-semibold text-brand" onClick={() => setP({ ...p, paragraphs: [...p.paragraphs, { label: String.fromCharCode(65 + p.paragraphs.length), text: "" }] })}><Plus className="h-3.5 w-3.5" /> Add paragraph</button>
      {listening && (
        <>
          <div className="mt-5"><TextInput label="Audio file URL (optional)" value={p.audioUrl ?? ""} onChange={(e) => setP({ ...p, audioUrl: e.target.value || undefined })} hint="Without an audio file the script below is read aloud with speech synthesis." /></div>
          <p className="label mt-5">Recording script</p>
          <div className="space-y-2">
            {(p.audioScript ?? []).map((line, i) => (
              <div key={i} className="flex gap-2">
                <input className="input w-36" value={line.speaker ?? ""} placeholder="Speaker" onChange={(e) => setP({ ...p, audioScript: p.audioScript!.map((x, j) => (j === i ? { ...x, speaker: e.target.value } : x)) })} aria-label="Speaker" />
                <input className="input flex-1" value={line.text} onChange={(e) => setP({ ...p, audioScript: p.audioScript!.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} aria-label={`Line ${i + 1}`} />
                <button className="rounded p-2 text-ink-muted hover:text-danger" onClick={() => setP({ ...p, audioScript: p.audioScript!.filter((_, j) => j !== i) })} aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button className="mt-2 flex items-center gap-1 text-sm font-semibold text-brand" onClick={() => setP({ ...p, audioScript: [...(p.audioScript ?? []), { speaker: "", text: "" }] })}><Plus className="h-3.5 w-3.5" /> Add line</button>
        </>
      )}
      <div className="mt-5 flex justify-end"><button className="btn-primary" onClick={save} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Save passage</button></div>
    </section>
  );
}

export default function LessonEditor() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => instructorApi.lesson(id), [id]);
  const [tab, setTab] = useState<Tab>("content");
  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [deleting, setDeleting] = useState<Question | null>(null);
  const [upload, setUpload] = useState<{ file: File; title: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const { lesson, course, set } = data;

  const toggleStatus = async () => {
    try {
      await instructorApi.setLessonStatus(lesson.id, lesson.status === "published" ? "hidden" : "published");
      toast(lesson.status === "published" ? "Lesson hidden." : "Lesson published.");
      reload(true);
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const addResource = async () => {
    if (!upload) return;
    setBusy(true);
    try {
      let url: string | undefined;
      if (upload.file.size <= 700 * 1024) url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(upload.file); });
      const ext = upload.file.name.split(".").pop()?.toLowerCase();
      await instructorApi.addResource(lesson.id, { title: upload.title || upload.file.name, fileName: upload.file.name, size: upload.file.size, kind: ext === "pdf" ? "pdf" : ext === "ppt" || ext === "pptx" ? "slides" : "doc", url });
      toast(url ? "Resource uploaded." : "Resource added (file too large for demo storage — metadata only).");
      setUpload(null);
      reload(true);
    } catch (e) {
      toast(e instanceof ApiError ? Object.values(e.fields ?? {})[0] ?? e.message : (e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Link href={`/instructor/courses/${course.id}`} className="text-sm font-semibold text-ink-muted hover:text-ink">← {course.title}</Link>
      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2"><span className={cx("pill", SKILL_META[lesson.skill].chip)}>{SKILL_META[lesson.skill].label}</span><span className="text-sm text-ink-muted">Lesson {lesson.order}</span><StatusPill tone={lesson.status === "published" ? "green" : lesson.status === "draft" ? "gray" : "violet"}>{lesson.status}</StatusPill></div>
          <h1 className="mt-2 font-serif text-[32px] font-bold leading-tight">{lesson.title}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/learn/${course.slug}/${lesson.id}`} className="btn-outline"><Eye className="h-4 w-4" /> Preview</Link>
          <button className={lesson.status === "published" ? "btn-outline" : "btn-primary"} onClick={toggleStatus}>{lesson.status === "published" ? <><EyeOff className="h-4 w-4" /> Hide lesson</> : <><Eye className="h-4 w-4" /> Publish lesson</>}</button>
        </div>
      </div>

      <Tabs className="mt-6" value={tab} onChange={setTab} tabs={[{ id: "content", label: "Lesson content" }, { id: "practice", label: `Practice set (${set?.questions.length ?? 0})` }, { id: "resources", label: `Resources (${lesson.resources.length})` }]} />
      <div className="pt-6">
        {tab === "content" && <ContentForm key={lesson.updatedAt} lesson={lesson} onSaved={() => reload(true)} />}

        {tab === "practice" && set && (
          <div className="space-y-6">
            <PassageEditor key={set.id + set.questions.length} set={set} onSaved={() => reload(true)} />
            <section className="overflow-hidden rounded-2xl border border-line bg-white">
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <h2 className="font-serif text-lg font-bold">Questions <span className="text-sm font-normal text-ink-muted">· auto-graded</span></h2>
                <button className="btn-primary btn-sm" onClick={() => setEditing("new")}><Plus className="h-3.5 w-3.5" /> Add question</button>
              </div>
              {set.questions.length === 0 ? <p className="px-5 py-6 text-sm text-ink-muted">No questions yet. Learners can&apos;t start this set until it has at least one question.</p> : (
                <ol className="divide-y divide-line">
                  {set.questions.map((q, i) => (
                    <li key={q.id} className="flex items-start gap-3 px-5 py-3.5">
                      <span className="w-6 pt-0.5 text-sm font-bold">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{q.prompt}</p>
                        <p className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-ink-muted">
                          <span className="rounded bg-sand px-1.5 py-0.5 font-semibold">{TYPE_LABEL[q.type]}</span>
                          <span className="rounded bg-sand px-1.5 py-0.5">Difficulty {q.difficulty}</span>
                          {q.skills.map((s) => <span key={s.skillId} className="rounded bg-teal-tint px-1.5 py-0.5 text-teal-ink">{s.skillId} · {s.weight}</span>)}
                          <span className="rounded bg-skill-r-bg px-1.5 py-0.5 text-skill-r-ink">Answer: {q.type === "mcq" || q.type === "heading" ? String.fromCharCode(65 + Number(q.answerKey)) : q.answerKey}</span>
                        </p>
                      </div>
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(q)}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                      <button className="rounded p-1.5 text-ink-muted hover:text-danger" onClick={() => setDeleting(q)} aria-label="Delete question"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}

        {tab === "resources" && (
          <section className="card p-6">
            <ul className="divide-y divide-line">
              {lesson.resources.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-3">
                  <span className="flex-1"><span className="block text-sm font-semibold">{r.title}</span><span className="text-xs text-ink-muted">{r.meta}{r.url ? "" : r.id.startsWith("res-") ? " · metadata only" : " · generated from lesson content"}</span></span>
                  <button className="rounded p-1.5 text-ink-muted hover:text-danger" onClick={async () => { await instructorApi.removeResource(lesson.id, r.id); toast("Resource removed."); reload(true); }} aria-label={`Remove ${r.title}`}><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
              {!lesson.resources.length && <li className="py-3 text-sm text-ink-muted">No resources yet.</li>}
            </ul>
            <div className="mt-5 rounded-xl border-2 border-dashed border-[#C9BFA9] p-5">
              {!upload ? (
                <label className="flex cursor-pointer flex-col items-center gap-1.5 text-center text-sm text-ink-muted">
                  <FileUp className="h-6 w-6" />
                  <span><strong className="text-ink">Upload slides, PDFs or worksheets</strong></span>
                  <span className="text-xs">Up to 50 MB · files ≤ 700 KB are stored in demo mode, larger ones as metadata</span>
                  <input type="file" className="sr-only" accept=".pdf,.ppt,.pptx,.doc,.docx,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) setUpload({ file: f, title: f.name.replace(/\.[^.]+$/, "") }); }} />
                </label>
              ) : (
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="flex-1"><TextInput label={`Title for ${upload.file.name}`} value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} /></div>
                  <button className="btn-ghost" onClick={() => setUpload(null)}>Cancel</button>
                  <button className="btn-primary" onClick={addResource} disabled={busy}>{busy && <Spinner className="h-4 w-4" />}Add resource</button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {editing && set && <QuestionModal setId={set.id} question={editing === "new" ? null : editing} primarySkill={lesson.skillIds[0]} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(true); }} />}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} danger title="Delete this question?" confirmLabel="Delete"
        onConfirm={async () => { await instructorApi.deleteQuestion(set!.id, deleting!.id); setDeleting(null); toast("Question deleted."); reload(true); }}
        body={<>Past attempts keep their recorded score, but the question will no longer appear in this set.</>} />
    </div>
  );
}
