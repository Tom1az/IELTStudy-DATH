"use client";

import { Check, X } from "lucide-react";
import type { Question } from "@/lib/types";
import { cx } from "@/lib/format";
import { parseMatchingValue } from "@/lib/api/quiz-mappers";

const TFNG = ["TRUE", "FALSE", "NOT GIVEN"];
const letter = (i: number) => String.fromCharCode(65 + i);

export interface ReviewInfo {
  isCorrect: boolean;
  answerKey: string;
  explanation: string;
}

function displayAnswer(q: Question, key: string) {
  if (q.type === "mcq") {
    const i = Number(key);
    return isNaN(i) ? key : `${letter(i)}  ${q.options?.[i] ?? ""}`;
  }
  if (q.type === "gap") return key.split("|").join(" / ");
  if (q.type === "matching") {
    const pairs = Object.entries(parseMatchingValue(key)).map(([item, choice]) => `${item} → ${choice}`);
    return pairs.join(", ");
  }
  return key;
}

/**
 * Matching: one dropdown per item (e.g. a heading for each paragraph). The answer is
 * kept as JSON text of item id → choice id, because the quiz player stores strings.
 */
function MatchingInputs({ q, value, onChange, disabled, review }: { q: Question; value: string; onChange?: (v: string) => void; disabled: boolean; review?: ReviewInfo }) {
  const picked = parseMatchingValue(value);
  const key = review ? parseMatchingValue(review.answerKey) : {};

  const pick = (itemId: string, choiceId: string) => {
    const next = { ...picked };
    if (choiceId) next[itemId] = choiceId;
    else delete next[itemId];
    onChange?.(Object.keys(next).length > 0 ? JSON.stringify(next) : "");
  };

  return (
    <div className="mt-3 space-y-2">
      {q.matchItems?.map((item) => (
        <label key={item.id} className="flex flex-wrap items-center gap-3">
          <span className="min-w-[110px] text-sm font-semibold">{item.text}</span>
          <select disabled={disabled} value={picked[item.id] ?? ""} onChange={(e) => pick(item.id, e.target.value)}
            className={cx("input h-11 max-w-md", review && (picked[item.id] === key[item.id] ? "border-brand bg-success-tint" : "border-danger bg-danger-tint"))}>
            <option value="">Choose…</option>
            {q.matchChoices?.map((c) => <option key={c.id} value={c.id}>{c.id}. {c.text}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

/** Renders one question for answering or (with `review`) for the post-quiz review. */
export function QuestionView({ q, number, value, onChange, review, disabled }: { q: Question; number: number; value: string; onChange?: (v: string) => void; review?: ReviewInfo; disabled?: boolean }) {
  const ro = !!review || disabled;
  const id = `q-${q.id}`;

  const promptEl =
    q.type === "gap" ? (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[15px] leading-relaxed text-ink">
        {q.prompt.split("___").map((part, i, arr) => (
          <span key={i} className="contents">
            <span>{part}</span>
            {i < arr.length - 1 && (
              <input
                id={id}
                aria-label={`Answer for question ${number}`}
                value={value}
                onChange={(e) => onChange?.(e.target.value)}
                readOnly={ro}
                placeholder={q.wordLimit ?? "ONE WORD"}
                autoComplete="off"
                spellCheck={false}
                className={cx(
                  "h-10 w-[150px] rounded-lg border-[1.5px] bg-white px-3 text-[15px] text-ink placeholder:text-[13px] placeholder:text-ink-soft focus:border-brand focus:outline-none",
                  review ? (review.isCorrect ? "border-brand bg-success-tint" : "border-danger bg-danger-tint") : value ? "border-brand bg-vanilla/40" : "border-line",
                )}
              />
            )}
          </span>
        ))}
      </p>
    ) : (
      <p className="text-base font-semibold leading-relaxed text-ink" id={`${id}-label`}>{q.prompt}</p>
    );

  return (
    <div id={`question-${number}`} className="scroll-mt-24">
      <div className="flex gap-3">
        <span className="mt-0.5 w-6 shrink-0 text-[15px] font-extrabold text-brand">{number}</span>
        <div className="min-w-0 flex-1">
          {promptEl}

          {q.type === "tfng" && (
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`${id}-label`}>
              {TFNG.map((o) => {
                const sel = value === o;
                const correct = review && review.answerKey === o;
                return (
                  <button key={o} type="button" role="radio" aria-checked={sel} disabled={ro} onClick={() => onChange?.(o)}
                    className={cx("h-11 min-w-[62px] rounded-xl px-4 text-[13px] font-bold transition-colors",
                      review
                        ? correct ? "border-2 border-brand bg-success-tint text-brand-ink" : sel ? "border-2 border-danger bg-danger-tint text-danger line-through" : "border border-line bg-white text-ink-soft"
                        : sel ? "border-2 border-brand bg-vanilla text-ink" : "border border-line bg-white text-ink hover:border-brand")}>
                    {o}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === "mcq" && (
            <div className={cx("mt-4 gap-3", (q.options?.length ?? 0) > 4 && q.options!.every((o) => o.length <= 2) ? "flex flex-wrap" : "flex flex-col")} role="radiogroup" aria-labelledby={`${id}-label`}>
              {q.options?.map((o, i) => {
                const sel = value === String(i);
                const correct = review && review.answerKey === String(i);
                const short = o.length <= 2;
                return (
                  <button key={i} type="button" role="radio" aria-checked={sel} disabled={ro} onClick={() => onChange?.(String(i))}
                    className={cx("flex items-center gap-3 rounded-2xl text-left text-[15px] leading-normal transition-colors", short ? "h-11 w-12 justify-center font-bold" : "min-h-[60px] w-full px-4 py-3",
                      review
                        ? correct ? "border-2 border-brand bg-success-tint" : sel ? "border-2 border-danger bg-danger-tint" : "border border-line bg-white text-ink-soft"
                        : sel ? "border-2 border-brand bg-vanilla font-semibold" : "border border-line bg-white hover:border-brand")}>
                    {!short && (
                      <span className={cx("flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border text-[13px] font-bold",
                        (review ? correct : sel) ? "border-brand bg-brand text-white" : review && sel ? "border-danger bg-danger text-white" : "border-line bg-ivory text-ink")}>
                        {letter(i)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">{o}</span>
                  </button>
                );
              })}
            </div>
          )}

          {q.type === "matching" && <MatchingInputs q={q} value={value} onChange={onChange} disabled={!!ro} review={review} />}

          {review && (
            <div className={cx("mt-3 rounded-lg px-3.5 py-3 text-sm", review.isCorrect ? "bg-success-tint text-brand-ink" : "bg-danger-tint text-danger")}>
              <p className="flex items-center gap-1.5 font-semibold">
                {review.isCorrect ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {review.isCorrect ? "Correct" : value ? "Incorrect" : "Not answered"}
                {!review.isCorrect && <span className="font-normal">· Answer: <strong>{displayAnswer(q, review.answerKey)}</strong></span>}
              </p>
              <p className="mt-1 text-ink">{review.explanation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
