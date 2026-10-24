"use client";

import { AlertTriangle } from "lucide-react";
import type { LearnerRow } from "@/lib/api";
import { EmptyState, ProgressBar, StatusPill } from "@/components/ui";
import { timeAgo } from "@/lib/format";

const RISK = { at_risk: { label: "At risk", tone: "red" as const }, watch: { label: "Watch", tone: "amber" as const }, on_track: { label: "On track", tone: "green" as const } };

/** Early-warning table: progress, activity, scores and weakest skills with the reasons behind each flag. */
export function LearnersTable({ rows }: { rows: LearnerRow[] }) {
  if (!rows.length) return <EmptyState title="No learners enrolled yet" />;
  return (
    <div className="overflow-x-auto">
      <table className="table-base min-w-[860px]">
        <thead><tr><th>Learner</th><th>Status</th><th className="w-40">Progress</th><th>Last active</th><th>Avg score</th><th>Weakest skills</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId}>
              <td><p className="font-semibold">{r.name}</p><p className="text-xs text-ink-muted">{r.email}</p></td>
              <td>
                <StatusPill tone={RISK[r.risk].tone}>{r.risk === "at_risk" && <AlertTriangle className="mr-1 h-3 w-3" />}{RISK[r.risk].label}</StatusPill>
                {r.riskReasons.length > 0 && <ul className="mt-1 space-y-0.5 text-[11px] text-ink-muted">{r.riskReasons.map((x) => <li key={x}>• {x}</li>)}</ul>}
              </td>
              <td><ProgressBar value={r.pct} color="bg-teal" label={`${r.name} progress`} /><p className="mt-1 text-xs text-ink-muted">{r.done} / {r.total} lessons · {r.pct}%</p></td>
              <td className={r.daysInactive >= 7 ? "font-semibold text-brand" : "text-ink-muted"}>{timeAgo(r.lastActiveAt)}</td>
              <td className="tabular-nums">{r.avgScore === null ? "—" : `${Math.round(r.avgScore * 100)}%`}</td>
              <td className="text-xs">{r.weakSkills.map((w) => <span key={w.id} className="mb-1 mr-1 inline-block rounded bg-sand px-1.5 py-0.5">{w.name} <strong>{w.p.toFixed(2)}</strong></span>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
