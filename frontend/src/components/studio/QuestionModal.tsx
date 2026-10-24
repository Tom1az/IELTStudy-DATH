"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { instructorApi, ApiError } from "@/lib/api";
import type { Question, QuestionType } from "@/lib/types";
import { Modal, Select, Spinner, TextArea, TextInput, useToast } from "@/components/ui";
import { QuestionView } from "@/components/quiz/QuestionView";
import { QMatrixEditor } from "./SkillPicker";

const TYPES: { id: QuestionType; label: string }[] = [
  { id: "tfng", label: "True / False / Not Given" },
  { id: "ynng", label: "Yes / No / Not Given" },
  { id: "mcq", label: "Multiple choice" },
  { id: "gap", label: "Gap fill / completion" },
  { id: "heading", label: "Matching headings (dropdown)" },
];

type Draft = Omit<Question, "id" | "passageId"> & { id?: string };

const blank = (primarySkill?: string): Draft => ({
  type: "mcq", prompt: "", options: ["", "", "", ""], answerKey: "", explanation: "", difficulty: 2, skills: primarySkill ? [{ skillId: primarySkill, weight: 1 }] : [],
});

export function QuestionModal({ setId, question, primarySkill, onClose, onSaved }: { setId: string; question: Question | null; primarySkill?: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState<Draft>(question ? { ...question, options: question.options ?? ["", "", "", ""] } : blank(primarySkill));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const opts = q.options ?? [];
  const isChoice = q.type === "mcq" || q.type === "heading";

  const save = async () => {
    setPending(true);
    setErrs({});
    try {
      await instructorApi.upsertQuestion(setId, q);
      toast(question ? "Question updated." : "Question added.");
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrs(e.fields); else toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={question ? "Edit question" : "Add question"} wide footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Save question</button></>}>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Question type" value={q.type} onChange={(e) => { const type = e.target.value as QuestionType; setQ({ ...q, type, answerKey: "", wordLimit: type === "gap" ? q.wordLimit ?? "ONE WORD" : undefined }); }}>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
            <Select label="Difficulty" value={q.difficulty} onChange={(e) => setQ({ ...q, difficulty: Number(e.target.value) as 1 | 2 | 3 })}>
              <option value={1}>1 · Easy</option><option value={2}>2 · Medium</option><option value={3}>3 · Hard</option>
            </Select>
            <TextInput label="Group heading (optional)" value={q.groupLabel ?? ""} onChange={(e) => setQ({ ...q, groupLabel: e.target.value || undefined })} placeholder="Questions 1–4" />
            {q.type === "gap" && <TextInput label="Word limit shown in the box" value={q.wordLimit ?? ""} onChange={(e) => setQ({ ...q, wordLimit: e.target.value })} placeholder="ONE WORD" />}
          </div>
          <TextArea label="Group instructions (optional)" value={q.groupInstruction ?? ""} onChange={(e) => setQ({ ...q, groupInstruction: e.target.value || undefined })} className="min-h-[60px]" />
          <TextArea label={q.type === "gap" ? "Sentence — mark the gap with ___" : "Question / statement"} value={q.prompt} onChange={(e) => setQ({ ...q, prompt: e.target.value })} error={errs.prompt ?? errs.gap} className="min-h-[70px]" />

          {isChoice && (
            <fieldset>
              <legend className="label">Options — select the correct one</legend>
              <div className="space-y-2">
                {opts.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" name="correct" checked={q.answerKey === String(i)} onChange={() => setQ({ ...q, answerKey: String(i) })} className="h-4 w-4 accent-teal" aria-label={`Option ${i + 1} is correct`} />
                    <span className="w-5 text-sm font-semibold">{String.fromCharCode(65 + i)}</span>
                    <input className="input" value={o} onChange={(e) => setQ({ ...q, options: opts.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Option ${String.fromCharCode(65 + i)}`} />
                    <button type="button" className="rounded p-1.5 text-ink-muted hover:text-danger disabled:opacity-30" disabled={opts.length <= 2} onClick={() => setQ({ ...q, options: opts.filter((_, j) => j !== i), answerKey: q.answerKey === String(i) ? "" : q.answerKey })} aria-label="Remove option"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
              <button type="button" className="mt-2 flex items-center gap-1 text-sm font-semibold text-brand" onClick={() => setQ({ ...q, options: [...opts, ""] })} disabled={opts.length >= 10}><Plus className="h-3.5 w-3.5" /> Add option</button>
              {(errs.options || errs.answerKey) && <p className="mt-1.5 text-xs font-medium text-danger">{errs.options ?? errs.answerKey}</p>}
            </fieldset>
          )}
          {(q.type === "tfng" || q.type === "ynng") && (
            <Select label="Correct answer" value={q.answerKey} onChange={(e) => setQ({ ...q, answerKey: e.target.value })} error={errs.answerKey}>
              <option value="">Choose…</option>
              {(q.type === "tfng" ? ["TRUE", "FALSE", "NOT GIVEN"] : ["YES", "NO", "NOT GIVEN"]).map((o) => <option key={o}>{o}</option>)}
            </Select>
          )}
          {q.type === "gap" && <TextInput label="Accepted answers" value={q.answerKey} onChange={(e) => setQ({ ...q, answerKey: e.target.value })} error={errs.answerKey} hint="Separate alternatives with | (e.g. jet lag|jetlag). Matching ignores case, punctuation and number formatting." />}
          <TextArea label="Explanation shown after submitting" value={q.explanation} onChange={(e) => setQ({ ...q, explanation: e.target.value })} error={errs.explanation} className="min-h-[70px]" />
          <QMatrixEditor value={q.skills} onChange={(skills) => setQ({ ...q, skills })} error={errs.skills} />
        </div>
        <aside className="self-start rounded-xl bg-cream p-4 lg:sticky lg:top-20">
          <p className="eyebrow-muted mb-3">Learner preview</p>
          {q.prompt ? <QuestionView q={{ ...q, id: "preview", passageId: setId, options: isChoice ? opts.filter(Boolean) : undefined } as Question} number={1} value="" onChange={() => {}} /> : <p className="text-sm text-ink-muted">Start typing to see the question.</p>}
        </aside>
      </div>
    </Modal>
  );
}
