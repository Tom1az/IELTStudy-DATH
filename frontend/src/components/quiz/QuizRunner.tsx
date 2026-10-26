"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Timer, X } from "lucide-react";
import type { PracticeSet, SkillCategory } from "@/lib/types";
import { SKILL_META, cx, mmss } from "@/lib/format";
import { ConfirmDialog, Spinner } from "@/components/ui";
import { PassagePane } from "./PassagePane";
import { QuestionView } from "./QuestionView";

export interface QuizRunnerProps {
  title: string;
  skill?: SkillCategory;
  sections: PracticeSet[];
  initialAnswers?: Record<string, string>;
  initialSeconds: number;
  onSave?: (answers: Record<string, string>, remaining: number) => Promise<void>;
  onSubmit: (answers: Record<string, string>, timings: Record<string, number>) => Promise<void>;
  onExit: () => void;
  allowUntimed?: boolean;
}

/** Figma "Practice set" screen: passage left, questions right, palette + actions at the bottom. */
export function QuizRunner({ title, skill, sections, initialAnswers = {}, initialSeconds, onSave, onSubmit, onExit, allowUntimed = true }: QuizRunnerProps) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [remaining, setRemaining] = useState(initialSeconds);
  // A quiz without a time limit (initialSeconds 0) starts untimed
  const [timed, setTimed] = useState(initialSeconds > 0);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const timings = useRef<Record<string, number>>({});
  const lastAct = useRef(Date.now());
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const remRef = useRef(remaining);
  remRef.current = remaining;
  const qPane = useRef<HTMLDivElement>(null);

  const flat = useMemo(() => sections.flatMap((s, si) => s.questions.map((q) => ({ q, si }))), [sections]);
  const offsets = useMemo(() => sections.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + sections[i - 1].questions.length], []), [sections]);
  const answered = flat.filter(({ q }) => (answers[q.id] ?? "").trim() !== "").length;
  const section = sections[sectionIdx];

  const set = (qid: string, v: string) => {
    const now = Date.now();
    timings.current[qid] = (timings.current[qid] ?? 0) + (now - lastAct.current) / 1000;
    lastAct.current = now;
    setAnswers((a) => ({ ...a, [qid]: v }));
  };

  const doSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      await onSubmit(answersRef.current, timings.current);
    } finally {
      setSubmitting(false);
    }
  }, [onSubmit]);

  // countdown
  useEffect(() => {
    if (!timed || submitting) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [timed, submitting]);
  useEffect(() => {
    if (timed && remaining === 0 && !timeUp) {
      setTimeUp(true);
      doSubmit();
    }
  }, [remaining, timed, timeUp, doSubmit]);

  // autosave on change (debounced) and every 15 s
  useEffect(() => {
    if (!onSave) return;
    const t = setTimeout(() => onSave(answersRef.current, remRef.current).catch(() => {}), 1000);
    return () => clearTimeout(t);
  }, [answers, onSave]);
  useEffect(() => {
    if (!onSave) return;
    const id = setInterval(() => onSave(answersRef.current, remRef.current).catch(() => {}), 15000);
    return () => clearInterval(id);
  }, [onSave]);

  // warn before closing the tab mid-attempt
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (!submitting) { e.preventDefault(); } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [submitting]);

  const jump = (n: number) => {
    const target = flat[n - 1];
    if (!target) return;
    if (target.si !== sectionIdx) setSectionIdx(target.si);
    setTimeout(() => {
      const el = document.getElementById(`question-${n}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLElement>("input, button, select")?.focus({ preventScroll: true });
    }, 40);
  };

  const saveAndExit = async () => {
    if (onSave) {
      setSaving(true);
      try { await onSave(answersRef.current, remRef.current); } finally { setSaving(false); }
    }
    onExit();
  };

  const low = timed && remaining <= 60;

  return (
    <div className="flex h-[100dvh] flex-col bg-cream">
      {/* top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 bg-navy px-3 text-white md:h-[57px] md:px-6">
        <button onClick={saveAndExit} className="flex items-center gap-2 text-sm font-semibold hover:underline" aria-label="Save and exit">
          <X className="h-4 w-4" /> Exit
        </button>
        <span className="hidden h-6 w-px bg-white/25 sm:block" />
        {skill && <span className={cx("pill hidden px-2.5 py-1 sm:inline-flex", SKILL_META[skill].chip)}>{SKILL_META[skill].label}</span>}
        <h1 className="min-w-0 flex-1 truncate font-sans text-sm font-semibold md:text-[15px]">{title}</h1>
        <button
          onClick={() => allowUntimed && setTimed((t) => !t)}
          className={cx("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums", low ? "bg-brand text-white" : "bg-[#101B2C]")}
          aria-label={timed ? `${mmss(remaining)} left. Click to switch to untimed mode` : "Untimed. Click to switch the timer back on"}
          title={allowUntimed ? "Switch timed / untimed" : undefined}
        >
          <Timer className="h-4 w-4" /> {timed ? `${mmss(remaining)} left` : "Untimed"}
        </button>
      </header>

      {sections.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-white px-3 md:px-6" role="tablist" aria-label="Sections">
          {sections.map((s, i) => {
            const done = s.questions.filter((q) => answers[q.id]).length;
            return (
              <button key={s.id} role="tab" aria-selected={i === sectionIdx} onClick={() => setSectionIdx(i)} className={cx("tab whitespace-nowrap px-3 pt-3", i === sectionIdx && "tab-active")}>
                {s.title} <span className="text-xs text-ink-soft">{done}/{s.questions.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {timeUp && <div className="shrink-0 bg-brand px-4 py-2 text-center text-sm font-semibold text-white" role="alert">Time is up — submitting your answers…</div>}

      {/* panes */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="border-line bg-white px-5 py-6 lg:w-1/2 lg:overflow-y-auto lg:border-r lg:px-11 lg:py-9" aria-label="Passage">
          <PassagePane key={section.id} passage={section.passage} />
        </section>
        <section ref={qPane} className="px-5 py-6 lg:w-1/2 lg:overflow-y-auto lg:px-11 lg:py-9" aria-label="Questions">
          <h2 className="font-serif text-[22px] font-bold">Questions {offsets[sectionIdx] + 1}–{offsets[sectionIdx] + section.questions.length}</h2>
          <div className="mt-6 space-y-6">
            {section.questions.map((q, i) => (
              <QuestionView key={q.id} q={q} number={offsets[sectionIdx] + i + 1} value={answers[q.id] ?? ""} onChange={(v) => set(q.id, v)} disabled={submitting} />
            ))}
          </div>
          {sectionIdx < sections.length - 1 && (
            <button className="btn-dark mt-8" onClick={() => { setSectionIdx(sectionIdx + 1); qPane.current?.scrollTo({ top: 0 }); }}>
              Next section: {sections[sectionIdx + 1].title} →
            </button>
          )}
        </section>
      </div>

      {/* bottom bar */}
      <footer className="flex shrink-0 flex-col gap-3 border-t border-line bg-white px-3 py-3 md:flex-row md:items-center md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="hidden text-[13px] text-ink-muted sm:inline">Questions</span>
          <div className="flex gap-1.5 overflow-x-auto py-0.5 scrollbar-thin" role="navigation" aria-label="Question navigator">
            {flat.map(({ q }, i) => {
              const done = (answers[q.id] ?? "").trim() !== "";
              return (
                <button key={q.id} onClick={() => jump(i + 1)} aria-label={`Question ${i + 1}${done ? ", answered" : ""}`}
                  className={cx("h-9 w-9 shrink-0 rounded-lg border-[1.5px] text-sm font-semibold", done ? "border-teal bg-teal text-white" : "border-[#C9BFA9] bg-white text-ink hover:border-navy")}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          <span className="whitespace-nowrap text-[13px] text-ink-muted" aria-live="polite">{answered} of {flat.length} answered</span>
        </div>
        <div className="flex gap-2.5">
          {onSave && <button className="btn-outline flex-1 px-5 md:flex-none" onClick={saveAndExit} disabled={saving || submitting}>{saving && <Spinner className="h-4 w-4" />}Save and exit</button>}
          <button className="btn-primary flex-1 px-5 md:flex-none" onClick={() => (answered < flat.length ? setConfirm(true) : doSubmit())} disabled={submitting}>
            {submitting && <Spinner className="h-4 w-4" />}Submit answers
          </button>
        </div>
      </footer>

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); doSubmit(); }} title="Submit with unanswered questions?" confirmLabel="Submit anyway"
        body={<>You have answered {answered} of {flat.length} questions. Unanswered questions are marked wrong and count towards your skill estimate.</>} />
    </div>
  );
}
