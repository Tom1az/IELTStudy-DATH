"use client";

import { useState } from "react";
import { CheckCircle2, EyeOff, XCircle } from "lucide-react";
import { hideReportedContent, setReportStatus, useReports, type ContentReport, type ReportStatus } from "@/lib/mock/social";
import { fmtDate, timeAgo } from "@/lib/format";
import { EmptyState, PageHeader, StatusPill, Tabs, useToast } from "@/components/ui";

const TABS: { id: ReportStatus | "all"; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
  { id: "dismissed", label: "Dismissed" },
  { id: "all", label: "All" },
];

const STATUS_TONE = { open: "amber", resolved: "green", dismissed: "gray" } as const;

export default function ContentReportsPage() {
  const toast = useToast();
  const [status, setStatus] = useState<ReportStatus | "all">("open");
  const rows = useReports(status);

  const act = (r: ContentReport, action: "hide" | "dismiss" | "resolve") => {
    if (action === "hide") {
      hideReportedContent(r);
      toast("Content hidden and report resolved.");
    } else {
      setReportStatus(r.id, action === "dismiss" ? "dismissed" : "resolved");
      toast(action === "dismiss" ? "Report dismissed." : "Report resolved.");
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Admin" title="Content reports">
        Reports from learners and instructors. Hiding a comment removes its text for everyone.
      </PageHeader>

      <Tabs tabs={TABS} value={status} onChange={setStatus} className="mb-5" />

      {rows.length === 0 ? (
        <div className="card"><EmptyState title="No reports here" /></div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="table-base min-w-[860px]">
            <thead>
              <tr><th>Content</th><th>Reason</th><th>Reported by</th><th>Reported</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <p className="font-semibold">{r.targetLabel}</p>
                    <p className="text-xs capitalize text-ink-muted">{r.targetType}</p>
                  </td>
                  <td>{r.reason}</td>
                  <td>{r.reporterName}</td>
                  <td className="text-ink-muted" title={fmtDate(r.createdAt, true)}>{timeAgo(r.createdAt)}</td>
                  <td><StatusPill tone={STATUS_TONE[r.status]}>{r.status}</StatusPill></td>
                  <td>
                    {r.status === "open" && (
                      <div className="flex justify-end gap-1.5">
                        {r.targetType === "comment" && (
                          <button className="btn-ghost btn-sm text-danger" onClick={() => act(r, "hide")}><EyeOff className="h-3.5 w-3.5" /> Hide</button>
                        )}
                        <button className="btn-ghost btn-sm" onClick={() => act(r, "dismiss")}><XCircle className="h-3.5 w-3.5" /> Dismiss</button>
                        <button className="btn-outline btn-sm" onClick={() => act(r, "resolve")}><CheckCircle2 className="h-3.5 w-3.5" /> Resolve</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
