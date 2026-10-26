"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import type { QuestionInput } from "@/lib/api/instructor";
import type { BackendChoiceOption, BackendPassage, BackendQuestion, BackendQuestionType } from "@/lib/api/backend-types";
import type { QuestionSkill } from "@/lib/types";
import { Modal, Select, Spinner, TextArea, TextInput, useToast } from "@/components/ui";
import { QMatrixEditor } from "@/components/studio/SkillPicker";

const TYPES: { id: BackendQuestionType; label: string }[] = [
  { id: "multiple_choice", label: "Multiple choice" },
  { id: "error_identification", label: "Error identification (pick the wrong part)" },
  { id: "true_false_not_given", label: "True / False / Not Given" },
  { id: "gap_fill", label: "Gap fill" },
  { id: "matching", label: "Matching (e.g. headings to paragraphs)" },
];

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

/** Gives options fresh ids in order: A, B, C... (or i, ii, iii... for matching choices). */
function withIds(texts: string[], ids: string[]): BackendChoiceOption[] {
  return texts.map((text, i) => ({ id: ids[i], text }));
}

interface Draft {
  questionType: BackendQuestionType;
  questionText: string;
  passageId: string;
  options: string[];
  correctOption: number;
  tfng: string;
  accepted: string;
  items: string[];
  choices: string[];
  /** matching: index of the correct choice for each item */
  matches: number[];
  explanation: string;
  difficulty: number;
  skills: QuestionSkill[];
}

/** Turns a saved question back into the form's fields. */
function toDraft(q: BackendQuestion | null): Draft {
  const draft: Draft = {
    questionType: "multiple_choice", questionText: "", passageId: "", options: ["", "", "", ""], correctOption: -1, tfng: "", accepted: "",
    items: ["", ""], choices: ["", "", ""], matches: [-1, -1], explanation: "", difficulty: 3, skills: [],
  };
  if (!q) return draft;
  draft.questionType = q.questionType;
  draft.questionText = q.questionText;
  draft.passageId = q.passageId === null ? "" : String(q.passageId);
  draft.explanation = q.explanation ?? "";
  draft.difficulty = q.difficulty;
  draft.skills = q.skills.map((s) => ({ skillId: String(s.skillId), weight: s.weight }));
  if (Array.isArray(q.options)) {
    draft.options = q.options.map((o) => o.text);
    draft.correctOption = q.options.findIndex((o) => o.id === q.answerKey);
  } else if (q.options) {
    const { items, choices } = q.options;
    const key = q.answerKey as Record<string, string>;
    draft.items = items.map((o) => o.text);
    draft.choices = choices.map((o) => o.text);
    draft.matches = items.map((item) => choices.findIndex((c) => c.id === key[item.id]));
  }
  if (q.questionType === "true_false_not_given") draft.tfng = String(q.answerKey);
  if (q.questionType === "gap_fill") draft.accepted = (q.answerKey as string[]).join(" | ");
  return draft;
}

/** Builds the API body from the form. The backend checks the details (400 with a message). */
function toInput(d: Draft): QuestionInput {
  const base = {
    passageId: d.passageId ? Number(d.passageId) : null,
    questionType: d.questionType,
    questionText: d.questionText,
    explanation: d.explanation.trim() || null,
    difficulty: d.difficulty,
    skills: d.skills.map((s) => ({ skillId: Number(s.skillId), weight: s.weight })),
  };
  if (d.questionType === "true_false_not_given") return { ...base, options: null, answerKey: d.tfng };
  if (d.questionType === "gap_fill") {
    const accepted = d.accepted.split("|").map((a) => a.trim()).filter(Boolean);
    return { ...base, options: null, answerKey: accepted };
  }
  if (d.questionType === "matching") {
    const items = withIds(d.items, d.items.map((_, i) => String(i + 1)));
    const choices = withIds(d.choices, ROMAN);
    const key: Record<string, string> = {};
    for (let i = 0; i < items.length; i++) {
      if (d.matches[i] >= 0) key[items[i].id] = choices[d.matches[i]].id;
    }
    return { ...base, options: { items, choices }, answerKey: key };
  }
  const options = withIds(d.options, LETTERS);
  return { ...base, options, answerKey: d.correctOption >= 0 ? options[d.correctOption].id : "" };
}

function ListEditor({ label, values, onChange, min, prefix }: { label: string; values: string[]; onChange: (v: string[]) => void; min: number; prefix: (i: number) => string }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="space-y-2">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-7 text-sm font-semibold">{prefix(i)}</span>
            <input className="input" value={v} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`${label} ${prefix(i)}`} />
            <button type="button" className="rounded p-1.5 text-ink-muted hover:text-danger disabled:opacity-30" disabled={values.length <= min} onClick={() => onChange(values.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <button type="button" className="mt-2 flex items-center gap-1 text-sm font-semibold text-brand" disabled={values.length >= 10} onClick={() => onChange([...values, ""])}><Plus className="h-3.5 w-3.5" /> Add</button>
    </fieldset>
  );
}

/**
 * Real backend: write or edit one question. `skills` is the question's row of the
 * Q-matrix, and its weights must add up to 1 (spec: the BKT update splits each answer
 * across the question's skills by these weights).
 */
export function QuestionForm({ question, passages, onClose, onSave }: { question: BackendQuestion | null; passages: BackendPassage[]; onClose: () => void; onSave: (input: QuestionInput) => Promise<void> }) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => toDraft(question));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const total = d.skills.reduce((sum, s) => sum + s.weight, 0);
  const isChoice = d.questionType === "multiple_choice" || d.questionType === "error_identification";

  const save = async () => {
    setPending(true);
    setErrs({});
    try {
      await onSave(toInput(d));
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrs(e.fields);
      toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={question ? "Edit question" : "Add question"} wide footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Save question</button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Question type" value={d.questionType} onChange={(e) => setD({ ...d, questionType: e.target.value as BackendQuestionType })}>
            {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
          <Select label="Difficulty" value={d.difficulty} onChange={(e) => setD({ ...d, difficulty: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{n === 1 ? " · Easy" : n === 5 ? " · Hard" : ""}</option>)}
          </Select>
          <Select label="Passage" value={d.passageId} onChange={(e) => setD({ ...d, passageId: e.target.value })} error={errs.passageId}>
            <option value="">No passage</option>
            {passages.map((p) => <option key={p.passageId} value={p.passageId}>{p.title ?? `Passage ${p.passageId}`}</option>)}
          </Select>
        </div>
        <TextArea label={d.questionType === "gap_fill" ? "Sentence: mark the gap with ______" : "Question or statement"} value={d.questionText} onChange={(e) => setD({ ...d, questionText: e.target.value })} error={errs.questionText} className="min-h-[70px]" />

        {isChoice && (
          <>
            <ListEditor label="Options" values={d.options} onChange={(options) => setD({ ...d, options, correctOption: d.correctOption < options.length ? d.correctOption : -1 })} min={2} prefix={(i) => LETTERS[i]} />
            <Select label="Correct option" value={d.correctOption} onChange={(e) => setD({ ...d, correctOption: Number(e.target.value) })}>
              <option value={-1}>Choose…</option>
              {d.options.map((o, i) => <option key={i} value={i}>{LETTERS[i]}. {o}</option>)}
            </Select>
          </>
        )}
        {d.questionType === "true_false_not_given" && (
          <Select label="Correct answer" value={d.tfng} onChange={(e) => setD({ ...d, tfng: e.target.value })}>
            <option value="">Choose…</option>
            <option value="true">TRUE</option>
            <option value="false">FALSE</option>
            <option value="not_given">NOT GIVEN</option>
          </Select>
        )}
        {d.questionType === "gap_fill" && (
          <TextInput label="Accepted answers" value={d.accepted} onChange={(e) => setD({ ...d, accepted: e.target.value })} hint="Separate alternatives with | (e.g. colour | color). Grading ignores case and extra spaces." />
        )}
        {d.questionType === "matching" && (
          <div className="grid gap-4 md:grid-cols-2">
            <ListEditor label="Items (e.g. paragraphs)" values={d.items} onChange={(items) => setD({ ...d, items, matches: items.map((_, i) => d.matches[i] ?? -1) })} min={1} prefix={(i) => String(i + 1)} />
            <ListEditor label="Choices (e.g. headings)" values={d.choices} onChange={(choices) => setD({ ...d, choices, matches: d.matches.map((m) => (m < choices.length ? m : -1)) })} min={2} prefix={(i) => ROMAN[i]} />
            <div className="space-y-2 md:col-span-2">
              <p className="label">Correct choice for each item</p>
              {d.items.map((item, i) => (
                <label key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-40 truncate">{i + 1}. {item}</span>
                  <select className="input" value={d.matches[i] ?? -1} onChange={(e) => setD({ ...d, matches: d.matches.map((m, j) => (j === i ? Number(e.target.value) : m)) })}>
                    <option value={-1}>Choose…</option>
                    {d.choices.map((c, j) => <option key={j} value={j}>{ROMAN[j]}. {c}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}

        <TextArea label="Explanation shown after submitting" value={d.explanation} onChange={(e) => setD({ ...d, explanation: e.target.value })} className="min-h-[70px]" />
        <QMatrixEditor value={d.skills} onChange={(skills) => setD({ ...d, skills })} error={errs.skills} />
        <p className={Math.abs(total - 1) < 0.001 ? "text-xs text-teal" : "text-xs font-semibold text-brand"}>
          Weights add up to {total.toFixed(1)}. They must add up to 1.0.
        </p>
      </div>
    </Modal>
  );
}
