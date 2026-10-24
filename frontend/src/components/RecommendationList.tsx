"use client";

import Link from "next/link";
import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { meApi } from "@/lib/api";
import type { Recommendation } from "@/lib/types";
import { SKILL_META, cx } from "@/lib/format";

export function recHref(r: Recommendation) {
  return r.kind === "practice" ? `/practice/${r.targetId}` : `/learn/${r.courseSlug}/${r.targetId}`;
}

/** Recommendation rows with human-readable rationale and helpful / not-helpful feedback. */
export function RecommendationList({ items, compact, feedback = true }: { items: Recommendation[]; compact?: boolean; feedback?: boolean }) {
  const [voted, setVoted] = useState<Record<string, "helpful" | "not_helpful">>({});
  const vote = (r: Recommendation, v: "helpful" | "not_helpful") => {
    setVoted((x) => ({ ...x, [r.id]: v }));
    meApi.recommendationFeedback(r, v).catch(() => {});
  };
  return (
    <ul className={cx(compact ? "space-y-2.5" : "space-y-3")}>
      {items.map((r) => (
        <li key={r.id} className="rounded-xl border border-line bg-white">
          <Link href={recHref(r)} onClick={() => meApi.recommendationFeedback(r, "clicked").catch(() => {})} className={cx("flex hover:bg-cream", compact ? "items-center gap-3 px-3.5 py-3" : "flex-col gap-1.5 px-3.5 py-3")}>
            {compact ? (
              <>
                <span className={cx("pill shrink-0", SKILL_META[r.skill].chip)}>{SKILL_META[r.skill].label}</span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{r.title}</span>
                <span className="whitespace-nowrap text-xs text-ink-muted">{r.kind === "lesson" ? "Lesson" : "Practice"} · {r.minutes} min</span>
              </>
            ) : (
              <>
                <span className="flex items-center justify-between gap-2">
                  <span className={cx("pill shrink-0", SKILL_META[r.skill].chip)}>{SKILL_META[r.skill].label}</span>
                  <span className="whitespace-nowrap text-xs text-ink-muted">{r.kind === "lesson" ? "Lesson" : "Practice"} · {r.minutes} min</span>
                </span>
                <span className="text-[15px] font-semibold leading-snug">{r.title}</span>
                <span className="text-xs leading-snug text-ink-muted">{r.reason}</span>
              </>
            )}
          </Link>
          {compact && <p className="-mt-1 px-3.5 pb-2.5 text-[11.5px] leading-snug text-ink-soft">{r.reason}</p>}
          {feedback && !compact && (
            <div className="flex items-center gap-3 border-t border-line px-3.5 py-2 text-xs text-ink-muted">
              {voted[r.id] ? (
                <span>Thanks for the feedback.</span>
              ) : (
                <>
                  <span>Useful?</span>
                  <button className="flex items-center gap-1 hover:text-teal" onClick={() => vote(r, "helpful")} aria-label="Helpful"><ThumbsUp className="h-3.5 w-3.5" /> Yes</button>
                  <button className="flex items-center gap-1 hover:text-brand" onClick={() => vote(r, "not_helpful")} aria-label="Not helpful"><ThumbsDown className="h-3.5 w-3.5" /> No</button>
                </>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
