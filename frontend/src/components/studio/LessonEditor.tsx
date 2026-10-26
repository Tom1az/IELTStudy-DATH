"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { ApiError, instructorApi } from "@/lib/api";
import { isEditable, type QuestionInput } from "@/lib/api/instructor";
import type { BackendLesson, BackendLessonDetail, BackendPassage, BackendQuestion, BackendQuiz } from "@/lib/api/backend-types";
import { useAsync } from "@/lib/hooks";
import { Alert, ConfirmDialog, ErrorState, PageLoader, Select, Spinner, StatusPill, TextArea, TextInput, useToast } from "@/components/ui";
import { SkillPicker } from "@/components/studio/SkillPicker";
import { PassageForm } from "./PassageForm";
import { QuestionForm } from "./QuestionForm";

const TYPE_LABEL = {
  multiple_choice: "Multiple choice",
  error_identification: "Error identification",
  true_false_not_given: "T/F/NG",
  gap_fill: "Gap fill",
  matching: "Matching",
};

const PASSAGE_LABEL = { reading_text: "Reading text", listening_audio: "Listening audio", video: "Video" };

function ContentForm({ lesson, editable, onSaved }: { lesson: BackendLessonDetail; editable: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: lesson.title, content: lesson.content ?? "", kind: lesson.kind, skillIds: lesson.skills.map((s) => String(s.skillId)) });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErrs({});
    try {
      await instructorApi.updateLesson(lesson.lessonId, {
        title: f.title,
        content: f.content.trim() || null,
        kind: f.kind,
        // Lesson tag weights don't need to add up to 1 (unlike a question's Q-matrix row)
        skills: f.skillIds.map((id) => ({ skillId: Number(id), weight: 1 })),
      });
      toast("Lesson saved.");
      onSaved();
    } catch (x) {
      if (x instanceof ApiError && x.fields) setErrs(x.fields);
      else toast((x as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="card grid gap-5 p-6 md:grid-cols-2" onSubmit={save} noValidate>
      <TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errs.title} disabled={!editable} />
      <Select label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as BackendLesson["kind"] })} disabled={!editable}>
        <option value="core">Core: part of the course sequence</option>
        <option value="remedial">Remedial: only reached through recommendations</option>
      </Select>
      <div className="md:col-span-2"><TextArea label="Lesson text (Markdown)" value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} error={errs.content} className="min-h-[200px]" disabled={!editable} /></div>
      <div className="md:col-span-2"><SkillPicker value={f.skillIds} onChange={(v) => editable && setF({ ...f, skillIds: v })} error={errs.skills} /></div>
      {editable && <div className="flex justify-end md:col-span-2"><button className="btn-primary" disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Save lesson</button></div>}
    </form>
  );
}

function QuizSettings({ quiz, editable, onSaved }: { quiz: BackendQuiz; editable: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(quiz.title);
  const [minutes, setMinutes] = useState(quiz.timeLimitSeconds ? String(Math.round(quiz.timeLimitSeconds / 60)) : "");
  const [pending, setPending] = useState(false);

  const save = async () => {
    setPending(true);
    try {
      // An empty time limit means the quiz is untimed
      await instructorApi.updateQuiz(quiz.quizId, { title, timeLimitSeconds: minutes ? Number(minutes) * 60 : null });
      toast("Quiz saved.");
      onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-3 border-b border-line px-5 py-4 md:grid-cols-[1fr_180px_auto] md:items-end">
      <TextInput label="Quiz title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} />
      <TextInput label="Time limit (minutes)" type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Untimed" disabled={!editable} />
      {editable && <button className="btn-outline" onClick={save} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Save quiz</button>}
    </div>
  );
}

/** Real backend: lesson content and skill tags, its passages and media, and its quiz questions. */
export function LessonEditor({ lessonId }: { lessonId: string }) {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => instructorApi.getLesson(lessonId), [lessonId]);
  const [passageForm, setPassageForm] = useState<BackendPassage | "new" | null>(null);
  const [deletingPassage, setDeletingPassage] = useState<BackendPassage | null>(null);
  // Which question is open in the form, and in which quiz (null quiz = the lesson's first question)
  const [questionForm, setQuestionForm] = useState<{ quiz: BackendQuiz | null; question: BackendQuestion | null } | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<{ quiz: BackendQuiz; question: BackendQuestion } | null>(null);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const { lesson, course, quizzes } = data;
  const editable = isEditable(course);

  const saveQuestion = async (input: QuestionInput) => {
    if (!questionForm) return;
    if (questionForm.question) await instructorApi.updateQuestion(questionForm.question.questionId, input);
    else await instructorApi.addQuestionToLesson(lesson, questionForm.quiz, input);
    toast(questionForm.question ? "Question saved." : "Question added.");
    setQuestionForm(null);
    reload(true);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Link href={`/instructor/courses/${course.courseId}`} className="text-sm font-semibold text-ink-muted hover:text-ink">← {course.title}</Link>
      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <StatusPill tone={lesson.kind === "core" ? "navy" : "violet"}>{lesson.kind}</StatusPill>
          <h1 className="mt-2 font-serif text-[32px] font-bold leading-tight">{lesson.title}</h1>
        </div>
        <Link href={`/learn/${course.courseId}/${lesson.lessonId}`} className="btn-outline"><Eye className="h-4 w-4" /> Preview</Link>
      </div>
      {!editable && <Alert tone="info" className="mt-4">The course isn&apos;t a draft, so this lesson is locked. Withdraw the course to draft to edit it.</Alert>}

      <h2 className="mb-3 mt-8 font-serif text-2xl font-bold">Lesson content</h2>
      <ContentForm key={`${lesson.title}-${lesson.skills.length}-${lesson.kind}`} lesson={lesson} editable={editable} onSaved={() => reload(true)} />

      <div className="mb-3 mt-10 flex items-center justify-between">
        <h2 className="font-serif text-2xl font-bold">Passages and media</h2>
        {editable && <button className="btn-primary btn-sm" onClick={() => setPassageForm("new")}><Plus className="h-3.5 w-3.5" /> Add passage</button>}
      </div>
      <section className="overflow-hidden rounded-2xl border border-line bg-white">
        {lesson.passages.length === 0 ? <p className="px-5 py-5 text-sm text-ink-muted">No passages yet. Add a reading text, a recording or a video.</p> : (
          <ul className="divide-y divide-line">
            {lesson.passages.map((p) => (
              <li key={p.passageId} className="flex items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{p.title ?? "Untitled"}</p>
                  <p className="text-xs text-ink-muted">{PASSAGE_LABEL[p.type]}{p.type !== "reading_text" && (p.mediaUrl ? " · file uploaded" : " · no playable file yet")}</p>
                </div>
                {editable && (
                  <>
                    <button className="btn-ghost btn-sm" onClick={() => setPassageForm(p)}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                    <button className="rounded p-1.5 text-ink-muted hover:text-danger" onClick={() => setDeletingPassage(p)} aria-label="Delete passage"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mb-3 mt-10 flex items-center justify-between">
        <h2 className="font-serif text-2xl font-bold">Quiz</h2>
        {editable && quizzes.length === 0 && <button className="btn-primary btn-sm" onClick={() => setQuestionForm({ quiz: null, question: null })}><Plus className="h-3.5 w-3.5" /> Add the first question</button>}
      </div>
      {quizzes.length === 0 && <p className="card p-5 text-sm text-ink-muted">No quiz yet. The first question you add creates the lesson&apos;s quiz.</p>}
      <div className="space-y-6">
        {quizzes.map((quiz) => (
          <section key={quiz.quizId} className="overflow-hidden rounded-2xl border border-line bg-white">
            <QuizSettings key={`${quiz.title}-${quiz.timeLimitSeconds}`} quiz={quiz} editable={editable} onSaved={() => reload(true)} />
            <ol className="divide-y divide-line">
              {quiz.questions.map((q, i) => (
                <li key={q.questionId} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="w-6 pt-0.5 text-sm font-bold">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{q.questionText}</p>
                    <p className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-ink-muted">
                      <span className="rounded bg-sand px-1.5 py-0.5 font-semibold">{TYPE_LABEL[q.questionType]}</span>
                      <span className="rounded bg-sand px-1.5 py-0.5">Difficulty {q.difficulty}</span>
                      {q.skills.map((s) => <span key={s.skillId} className="rounded bg-teal-tint px-1.5 py-0.5 text-teal-ink">{s.name} · {s.weight}</span>)}
                    </p>
                  </div>
                  {editable && (
                    <>
                      <button className="btn-ghost btn-sm" onClick={() => setQuestionForm({ quiz, question: q })}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                      <button className="rounded p-1.5 text-ink-muted hover:text-danger" onClick={() => setDeletingQuestion({ quiz, question: q })} aria-label="Delete question"><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </li>
              ))}
            </ol>
            {editable && <div className="border-t border-line px-5 py-3"><button className="btn-outline btn-sm" onClick={() => setQuestionForm({ quiz, question: null })}><Plus className="h-3.5 w-3.5" /> Add question</button></div>}
          </section>
        ))}
      </div>

      {passageForm && <PassageForm lessonId={lesson.lessonId} passage={passageForm === "new" ? null : passageForm} onClose={() => setPassageForm(null)} onSaved={() => { setPassageForm(null); reload(true); }} />}
      {questionForm && <QuestionForm question={questionForm.question} passages={lesson.passages} onClose={() => setQuestionForm(null)} onSave={saveQuestion} />}
      <ConfirmDialog open={!!deletingPassage} onClose={() => setDeletingPassage(null)} danger title="Delete this passage?" confirmLabel="Delete"
        onConfirm={async () => {
          const p = deletingPassage!;
          setDeletingPassage(null);
          try { await instructorApi.deletePassage(p.passageId); toast("Passage deleted."); reload(true); } catch (e) { toast((e as Error).message, "error"); }
        }}
        body={<>Its questions are deleted too. This is blocked once learners have answered them.</>} />
      <ConfirmDialog open={!!deletingQuestion} onClose={() => setDeletingQuestion(null)} danger title="Delete this question?" confirmLabel="Delete"
        onConfirm={async () => {
          const target = deletingQuestion!;
          setDeletingQuestion(null);
          try { await instructorApi.removeQuestion(target.quiz, target.question.questionId); toast("Question deleted."); reload(true); } catch (e) { toast((e as Error).message, "error"); }
        }}
        body={<>Removing the quiz&apos;s last question deletes the quiz. Both are blocked once learners have attempted the quiz.</>} />
    </div>
  );
}
