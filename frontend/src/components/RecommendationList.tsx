"use client";

import Link from "next/link";
import { meApi } from "@/lib/api";
import type { Recommendation } from "@/lib/types";
import { SKILL_META, cx } from "@/lib/format";

export function recHref(r: Recommendation) {
  return r.kind === "practice" ? `/practice/${r.targetId}` : `/learn/${r.courseId}/${r.targetId}`;
}

/** Recommendation rows with their human-readable rationale. Opening one records a click (for the evaluation). */
export function RecommendationList({ items, compact }: { items: Recommendation[]; compact?: boolean }) {
  return (
    <ul className={cx(compact ? "space-y-2.5" : "space-y-3")}>
      {items.map((r) => (
        <li key={r.id} className="rounded-xl border border-line bg-white">
          <Link href={recHref(r)} onClick={() => meApi.clickRecommendation(r.id).catch(() => {})} className={cx("flex hover:bg-cream", compact ? "items-center gap-3 px-3.5 py-3" : "flex-col gap-1.5 px-3.5 py-3")}>
            {compact ? (
              <>
                <span className={cx("pill shrink-0", SKILL_META[r.skill].chip)}>{SKILL_META[r.skill].label}</span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{r.title}</span>
                <span className="whitespace-nowrap text-xs text-ink-muted">{r.kind === "lesson" ? "Lesson" : "Practice"}</span>
              </>
            ) : (
              <>
                <span className="flex items-center justify-between gap-2">
                  <span className={cx("pill shrink-0", SKILL_META[r.skill].chip)}>{SKILL_META[r.skill].label}</span>
                  <span className="whitespace-nowrap text-xs text-ink-muted">{r.kind === "lesson" ? "Lesson" : "Practice"}</span>
                </span>
                <span className="text-[15px] font-semibold leading-snug">{r.title}</span>
                <span className="text-xs leading-snug text-ink-muted">{r.reason}</span>
              </>
            )}
          </Link>
          {compact && <p className="-mt-1 px-3.5 pb-2.5 text-[11.5px] leading-snug text-ink-soft">{r.reason}</p>}
        </li>
      ))}
    </ul>
  );
}
