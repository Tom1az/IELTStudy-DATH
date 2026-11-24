"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { meApi } from "@/lib/api";
import type { Recommendation } from "@/lib/types";
import { SKILL_META, cx } from "@/lib/format";

export function recHref(r: Recommendation) {
  if (r.kind === "practice") return `/practice/${r.targetId}`;
  // Every recommended lesson can be opened: core lessons only come from my enrolled courses, and
  // remedial lessons are open to every learner without enrolling (docs/ROADMAP.md, Decisions)
  return `/learn/${r.courseId}/${r.targetId}`;
}

/** Recommendation rows with their human-readable rationale. Opening one records a click (for the evaluation). */
export function RecommendationList({ items, compact }: { items: Recommendation[]; compact?: boolean }) {
  return (
    <ul className={cx("stagger", compact ? "space-y-2.5" : "space-y-3")}>
      {items.map((r) => (
        <li key={r.id} className="group rounded-xl border border-line bg-white transition duration-200 ease-swift hover:border-brand/30 hover:shadow-lift">
          <Link href={recHref(r)} onClick={() => meApi.clickRecommendation(r.id).catch(() => {})} className={cx("flex rounded-xl hover:bg-ivory", compact ? "items-center gap-3 px-3.5 py-3" : "flex-col gap-1.5 px-3.5 py-3")}>
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
                  <span className="flex items-center gap-1 whitespace-nowrap text-xs text-ink-muted">
                    {r.kind === "lesson" ? "Lesson" : "Practice"}
                    {/* Only on hover, so the row stays quiet until it is the one being read */}
                    <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden />
                  </span>
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
