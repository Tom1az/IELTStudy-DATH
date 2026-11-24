"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, FileText, Timer, X } from "lucide-react";
import type { PracticeSet, SkillCategory } from "@/lib/types";
import type { SaveOutcome } from "@/lib/api";
import { BRAND, SKILL_META, cx, mmss } from "@/lib/format";
import { ConfirmDialog, ProgressBar, SaveIndicator, Spinner, type SaveState } from "@/components/ui";
import { LogoMark } from "@/components/layout/Logo";
import { PassagePane } from "./PassagePane";
import { QuestionView } from "./QuestionView";

export interface QuizRunnerProps {
  title: string;
  skill?: SkillCategory;
  sections: PracticeSet[];
  initialAnswers?: Record<string, string>;
  initialSeconds: number;
  /** Autosave. Returning where the answers landed lets the header say so; void means "saved". */
  onSave?: (answers: Record<string, string>, remaining: number) => Promise<SaveOutcome | void>;
  onSubmit: (answers: Record<string, string>, timings: Record<string, number>, touchOrder: string[]) => Promise<void>;
  onExit: () => void;
  allowUntimed?: boolean;
}

/** How long after the last keystroke the answers are sent (the quiet moment between answers). */
const AUTOSAVE_DEBOUNCE_MS = 1200;
/** A second net under the debounce, in case someone sits on one question for a long time. */
const AUTOSAVE_INTERVAL_MS = 15000;

/** Figma "Reading practice" screen: passage card left, question card right, navigator + actions at the bottom. */
export function QuizRunner({ title, skill, sections, initialAnswers = {}, initialSeconds, onSave, onSubmit, onExit, allowUntimed = true }: QuizRunnerProps) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [remaining, setRemaining] = useState(initialSeconds);
  // A quiz without a time limit (initialSeconds 0) starts untimed
  const [timed, setTimed] = useState(initialSeconds > 0);
  const [sectionIdx, setSectionIdx] = useState(0);
  // Phones show the passage collapsed above the questions (Figma mobile frame)
  const [passageOpen, setPassageOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | undefined>();
  const [timeUp, setTimeUp] = useState(false);
  const timings = useRef<Record<string, number>>({});
  // A list, because an object sorts numeric keys and loses the order they were added in
  const touchOrder = useRef<string[]>([]);
  const lastAct = useRef(Date.now());
  // Nothing is sent until the learner actually answers something
  const touched = useRef(false);
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
    if (!touchOrder.current.includes(qid)) touchOrder.current.push(qid);
    lastAct.current = now;
    touched.current = true;
    setAnswers((a) => ({ ...a, [qid]: v }));
  };

  const doSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      await onSubmit(answersRef.current, timings.current, touchOrder.current);
    } finally {
      setSubmitting(false);
    }
  }, [onSubmit]);

  /** One autosave round, with the header line following along. */
  const persist = useCallback(async () => {
    if (!onSave) return;
    setSaveState("saving");
    try {
      const outcome = await onSave(answersRef.current, remRef.current);
      setSaveState(outcome?.where === "device" ? "device" : "saved");
      setSavedAt(outcome?.at ?? new Date().toISOString());
    } catch {
      // The next change (or the interval below) tries again, so this is not fatal
      setSaveState("error");
    }
  }, [onSave]);

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

  // Autosave: shortly after the last change, and on a slow timer for long pauses
  useEffect(() => {
    if (!onSave || !touched.current) return;
    const t = setTimeout(persist, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [answers, onSave, persist]);
  useEffect(() => {
    if (!onSave) return;
    const id = setInterval(() => { if (touched.current) persist(); }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [onSave, persist]);

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
    if (onSave && touched.current) await persist();
    onExit();
  };

  const saving = saveState === "saving";
  const low = timed && remaining <= 60;
  const firstNumber = offsets[sectionIdx] + 1;
  const lastNumber = offsets[sectionIdx] + section.questions.length;
  const subtitle = [skill ? SKILL_META[skill].label : null, sections.length > 1 ? section.title : null].filter(Boolean).join(" · ");

  return (
    <div className="flex h-[100dvh] flex-col bg-ivory">
      {/* top bar (Figma "Quiz header") */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white px-4 md:h-[88px] md:gap-6 md:px-6">
        <button onClick={saveAndExit} className="rounded-lg p-1.5 text-ink transition-colors hover:bg-brand-tint md:hidden" aria-label="Save and exit">
          <X className="h-5 w-5" />
        </button>
        <span className="hidden items-center gap-2.5 md:flex">
          <LogoMark />
          <span className="text-[23px] font-extrabold">{BRAND.name}</span>
        </span>
        <span className="hidden h-8 w-px bg-line md:block" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] md:text-lg">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-[11px] text-ink-muted md:text-xs">{subtitle}</p>}
        </div>
        <button
          onClick={() => allowUntimed && setTimed((t) => !t)}
          className={cx("flex h-9 items-center gap-2 rounded-lg px-3 tabular-nums transition-colors duration-300 md:h-11 md:px-4", low ? "bg-danger text-white" : "bg-brand-tint text-brand")}
          aria-label={timed ? `${mmss(remaining)} left. Click to switch to untimed mode` : "Untimed. Click to switch the timer back on"}
          title={allowUntimed ? "Switch timed / untimed" : undefined}
        >
          <Timer className="h-4 w-4 md:h-5 md:w-5" />
          <span className="text-sm font-extrabold md:text-base">{timed ? mmss(remaining) : "Untimed"}</span>
          {timed && <span className={cx("hidden text-xs sm:inline", low ? "text-white" : "text-ink")}>remaining</span>}
        </button>
        <button className="btn-outline hidden h-11 md:inline-flex" onClick={saveAndExit} disabled={saving || submitting} aria-label="Save and exit">
          {saving ? <Spinner className="h-4 w-4" /> : null}Save &amp; exit <X className="h-4 w-4" />
        </button>
      </header>

      {/* progress row */}
      <div className="flex shrink-0 flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-6 md:px-6 md:py-5">
        <div className="flex items-center justify-between gap-3 md:contents">
          <p className="whitespace-nowrap text-[13px] font-bold" aria-live="polite">{answered} of {flat.length} answered</p>
          {onSave && <SaveIndicator state={saveState} at={savedAt} className="md:order-last" />}
        </div>
        <div className="flex-1"><ProgressBar value={answered} max={flat.length} color="bg-brand" track="bg-brand-tint" height="h-1.5 md:h-[7px]" label="Questions answered" /></div>
      </div>

      {sections.length > 1 && (
        <div className="mx-4 mb-3 flex shrink-0 gap-1 overflow-x-auto border-b border-line md:mx-6" role="tablist" aria-label="Sections">
          {sections.map((s, i) => {
            const done = s.questions.filter((q) => answers[q.id]).length;
            return (
              <button key={s.id} role="tab" aria-selected={i === sectionIdx} onClick={() => { setSectionIdx(i); setPassageOpen(false); }} className={cx("tab whitespace-nowrap px-3", i === sectionIdx && "tab-active")}>
                {s.title} <span className="text-xs text-ink-soft">{done}/{s.questions.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {timeUp && <div className="mx-4 mb-3 shrink-0 animate-rise rounded-lg bg-danger px-4 py-2 text-center text-sm font-semibold text-white md:mx-6" role="alert">Time is up — submitting your answers…</div>}

      {/* passage | questions: two cards side by side on desktop, one scrolling column on phones */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 lg:flex-row lg:gap-6 lg:overflow-hidden lg:px-6 lg:pb-6">
        <section className="card flex shrink-0 flex-col overflow-hidden lg:w-1/2 lg:shrink" aria-label="Passage">
          <div className="flex h-16 shrink-0 items-center gap-2.5 border-line px-6 lg:border-b">
            <FileText className="h-[18px] w-[18px] shrink-0 text-ink" aria-hidden />
            <span className="truncate text-xs font-bold uppercase">{section.title}</span>
            <span className="whitespace-nowrap text-[11px] text-ink-muted">Questions {firstNumber}–{lastNumber}</span>
            <button type="button" onClick={() => setPassageOpen((o) => !o)} aria-expanded={passageOpen}
              className="ml-auto flex items-center gap-1 whitespace-nowrap text-xs font-bold text-brand lg:hidden">
              {passageOpen ? "Hide" : "Show"} passage <ChevronDown className={cx("h-4 w-4 transition-transform duration-200", passageOpen && "rotate-180")} aria-hidden />
            </button>
          </div>
          <div className={cx("border-t border-line px-6 py-6 lg:block lg:overflow-y-auto lg:border-t-0", passageOpen ? "block animate-rise" : "hidden")}>
            <PassagePane key={section.id} passage={section.passage} />
          </div>
        </section>

        <section ref={qPane} className="card shrink-0 p-6 lg:w-1/2 lg:shrink lg:overflow-y-auto" aria-label="Questions">
          <h2 className="pill bg-brand-tint text-brand">Questions {firstNumber}–{lastNumber}</h2>
          {/* Keyed on the section so moving between parts reads as a change of page, not a redraw */}
          <div key={section.id} className="mt-6 animate-rise space-y-8">
            {section.questions.map((q, i) => (
              <QuestionView key={q.id} q={q} number={offsets[sectionIdx] + i + 1} value={answers[q.id] ?? ""} onChange={(v) => set(q.id, v)} disabled={submitting} />
            ))}
          </div>
          {sectionIdx < sections.length - 1 && (
            <button className="btn-outline mt-8" onClick={() => { setSectionIdx(sectionIdx + 1); setPassageOpen(false); qPane.current?.scrollTo({ top: 0 }); }}>
              Next section: {sections[sectionIdx + 1].title} <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </section>
      </div>

      {/* bottom bar: question navigator + actions */}
      <footer className="flex shrink-0 flex-col gap-3 border-t border-line bg-white px-4 py-3 md:flex-row md:items-center md:px-6">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5 scrollbar-thin" role="navigation" aria-label="Question navigator">
          {flat.map(({ q }, i) => {
            const done = (answers[q.id] ?? "").trim() !== "";
            return (
              <button key={q.id} onClick={() => jump(i + 1)} aria-label={`Question ${i + 1}${done ? ", answered" : ""}`}
                className={cx("h-9 w-9 shrink-0 rounded-lg border text-sm font-bold transition duration-150 ease-swift active:scale-95", done ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:border-brand hover:bg-brand-tint")}>
                {i + 1}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2.5">
          {onSave && <button className="btn-outline h-12 flex-1 px-5 md:flex-none" onClick={saveAndExit} disabled={saving || submitting}>{saving && <Spinner className="h-4 w-4" />}Save and exit</button>}
          <button className="btn-primary h-12 flex-1 px-5 md:flex-none" onClick={() => (answered < flat.length ? setConfirm(true) : doSubmit())} disabled={submitting}>
            {submitting && <Spinner className="h-4 w-4" />}Submit answers <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </footer>

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); doSubmit(); }} title="Submit with unanswered questions?" confirmLabel="Submit anyway"
        body={<>You have answered {answered} of {flat.length} questions. Unanswered questions are marked wrong and count towards your skill estimate.</>} />
    </div>
  );
}
