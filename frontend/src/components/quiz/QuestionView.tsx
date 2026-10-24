"use client";

import { Check, X } from "lucide-react";
import type { Question } from "@/lib/types";
import { cx } from "@/lib/format";

const TFNG = ["TRUE", "FALSE", "NOT GIVEN"];
const letter = (i: number) => String.fromCharCode(65 + i);

export interface ReviewInfo {
  isCorrect: boolean;
  answerKey: string;
  explanation: string;
}

function displayAnswer(q: Question, key: string) {
  if (q.type === "mcq" || q.type === "heading") {
    const i = Number(key);
    return isNaN(i) ? key : `${letter(i)}  ${q.options?.[i] ?? ""}`;
  }
  if (q.type === "gap") return key.split("|").join(" / ");
  return key;
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
                  "h-10 w-[150px] rounded-lg border-[1.5px] bg-white px-3 text-[15px] text-ink placeholder:text-[13px] placeholder:text-ink-soft focus:border-navy focus:outline-none",
                  review ? (review.isCorrect ? "border-teal bg-teal-tint" : "border-brand bg-[#FDF1EE]") : value ? "border-navy" : "border-[#C9BFA9]",
                )}
              />
            )}
          </span>
        ))}
      </p>
    ) : (
      <p className="text-[15px] leading-relaxed text-ink" id={`${id}-label`}>{q.prompt}</p>
    );

  return (
    <div id={`question-${number}`} className="scroll-mt-24">
      <div className="flex gap-3">
        <span className="mt-0.5 w-5 shrink-0 text-[15px] font-bold text-ink">{number}</span>
        <div className="min-w-0 flex-1">
          {promptEl}

          {(q.type === "tfng" || q.type === "ynng") && (
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`${id}-label`}>
              {(q.type === "ynng" ? ["YES", "NO", "NOT GIVEN"] : TFNG).map((o) => {
                const sel = value === o;
                const correct = review && review.answerKey === o;
                return (
                  <button key={o} type="button" role="radio" aria-checked={sel} disabled={ro} onClick={() => onChange?.(o)}
                    className={cx("h-11 min-w-[62px] rounded-lg border-[1.5px] px-4 text-[13px] font-semibold transition-colors",
                      review
                        ? correct ? "border-teal bg-teal text-white" : sel ? "border-brand bg-brand-tint text-[#8A2E09] line-through" : "border-[#C9BFA9] bg-white text-ink-soft"
                        : sel ? "border-navy bg-navy text-white" : "border-[#C9BFA9] bg-white text-ink hover:border-navy")}>
                    {o}
                  </button>
                );
              })}
            </div>
          )}

          {(q.type === "mcq" || q.type === "heading") && (
            q.type === "heading" ? (
              <label className="mt-3 block">
                <span className="sr-only">Choose a heading for {q.prompt}</span>
                <select disabled={ro} value={value} onChange={(e) => onChange?.(e.target.value)}
                  className={cx("input h-11 max-w-md", review && (review.isCorrect ? "border-teal bg-teal-tint" : "border-brand bg-[#FDF1EE]"))}>
                  <option value="">Choose a heading…</option>
                  {q.options?.map((o, i) => <option key={i} value={String(i)}>{["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"][i]}. {o}</option>)}
                </select>
              </label>
            ) : (
              <div className={cx("mt-3 gap-2", (q.options?.length ?? 0) > 4 && q.options!.every((o) => o.length <= 2) ? "flex flex-wrap" : "flex flex-col")} role="radiogroup" aria-labelledby={`${id}-label`}>
                {q.options?.map((o, i) => {
                  const sel = value === String(i);
                  const correct = review && review.answerKey === String(i);
                  const short = o.length <= 2;
                  return (
                    <button key={i} type="button" role="radio" aria-checked={sel} disabled={ro} onClick={() => onChange?.(String(i))}
                      className={cx("flex items-center gap-3 rounded-lg border-[1.5px] text-left text-sm transition-colors", short ? "h-11 w-12 justify-center font-semibold" : "min-h-[46px] w-full px-4 py-2.5",
                        review
                          ? correct ? "border-teal bg-teal text-white" : sel ? "border-brand bg-brand-tint text-[#8A2E09]" : "border-[#C9BFA9] bg-white text-ink-soft"
                          : sel ? "border-navy bg-navy text-white" : "border-[#C9BFA9] bg-white text-ink hover:border-navy")}>
                      {!short && <span className="w-4 font-semibold">{letter(i)}</span>}
                      <span>{o}</span>
                    </button>
                  );
                })}
              </div>
            )
          )}

          {review && (
            <div className={cx("mt-3 rounded-lg px-3.5 py-3 text-sm", review.isCorrect ? "bg-teal-tint text-teal-ink" : "bg-[#FDF1EE] text-[#8A2E09]")}>
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
