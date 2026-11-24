"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ExternalLink, Flag } from "lucide-react";
import { reportsApi } from "@/lib/api";
import type { ContentReport, ReportStatus, ReportTargetType } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { fmtDate, timeAgo } from "@/lib/format";
import { EmptyState, ErrorState, Modal, PageHeader, PageLoader, Pagination, Select, Spinner, StatusPill, TextArea, useToast } from "@/components/ui";

const STATUS_TONE: Record<ReportStatus, "amber" | "green" | "gray"> = { open: "amber", resolved: "green", dismissed: "gray" };

function ReportsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const [status, setStatus] = useState<ReportStatus | "all">((sp.get("status") as ReportStatus | null) ?? "open");
  const [targetType, setTargetType] = useState<ReportTargetType | "all">((sp.get("type") as ReportTargetType | null) ?? "all");
  const [page, setPage] = useState(Math.max(1, Number(sp.get("page") ?? 1) || 1));
  const [handling, setHandling] = useState<{ report: ContentReport; decision: "resolved" | "dismissed" } | null>(null);
  const [note, setNote] = useState("");
  const [removeComment, setRemoveComment] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (status !== "open") params.set("status", status);
    if (targetType !== "all") params.set("type", targetType);
    if (page > 1) params.set("page", String(page));
    router.replace(`/admin/reports${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }, [status, targetType, page, router]);

  const { data, error, loading, reload } = useAsync(() => reportsApi.list({ status, targetType, page }), [status, targetType, page]);

  const submit = async () => {
    if (!handling) return;
    setPending(true);
    try {
      await reportsApi.handle(handling.report.id, {
        status: handling.decision,
        note,
        removeComment: handling.decision === "resolved" && handling.report.targetType === "comment" && !handling.report.removed && removeComment,
      });
      toast(handling.decision === "resolved" ? "Report resolved. The reporter has been told." : "Report dismissed.");
      setHandling(null);
      reload(true);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Admin" title="Content reports">Comments, lessons and questions that users reported. Resolve a report when you have acted on it (you can remove a reported comment here); dismiss it when nothing is wrong.</PageHeader>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="w-44"><Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as ReportStatus | "all"); setPage(1); }}>
          <option value="open">Open</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option><option value="all">All</option>
        </Select></div>
        <div className="w-44"><Select aria-label="Content type" value={targetType} onChange={(e) => { setTargetType(e.target.value as ReportTargetType | "all"); setPage(1); }}>
          <option value="all">All content</option><option value="comment">Comments</option><option value="lesson">Lessons</option><option value="question">Questions</option>
        </Select></div>
        {data && <p className="self-center text-sm text-ink-muted">{data.total} report{data.total === 1 ? "" : "s"}</p>}
      </div>

      {loading && !data ? <PageLoader /> : error || !data ? <ErrorState error={error} onRetry={reload} /> : data.items.length === 0 ? (
        <div className="card"><EmptyState icon={<Flag className="h-6 w-6" />} title={status === "open" ? "No open reports" : "No reports"} /></div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="table-base min-w-[860px]">
            <thead><tr><th>Reported</th><th>Reason</th><th>By</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-[320px]">
                    <p className="text-xs font-bold uppercase text-ink-muted">{r.targetType} #{r.targetId}{r.removed && " · removed"}</p>
                    <p className="line-clamp-2 text-sm">{r.preview ?? <span className="italic text-ink-soft">No longer exists</span>}</p>
                    {r.href && <Link href={r.href} target="_blank" className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">Open <ExternalLink className="h-3 w-3" /></Link>}
                  </td>
                  <td className="max-w-[240px] text-sm">{r.reason}</td>
                  <td className="text-sm">{r.reporter ?? "—"}<p className="text-xs text-ink-muted">{timeAgo(r.at)}</p></td>
                  <td>
                    <StatusPill tone={STATUS_TONE[r.status]}>{r.status}</StatusPill>
                    {r.handledBy && <p className="mt-1 text-xs text-ink-muted">by {r.handledBy}, {fmtDate(r.handledAt ?? undefined)}</p>}
                    {r.note && <p className="mt-0.5 text-xs italic text-ink-muted">“{r.note}”</p>}
                  </td>
                  <td>
                    {r.status === "open" && (
                      <div className="flex justify-end gap-2">
                        <button className="btn-ghost btn-sm" onClick={() => { setHandling({ report: r, decision: "dismissed" }); setNote(""); }}>Dismiss</button>
                        <button className="btn-primary btn-sm" onClick={() => { setHandling({ report: r, decision: "resolved" }); setNote(""); setRemoveComment(true); }}>Resolve</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.totalPages > 1 && <div className="mt-4"><Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} /></div>}

      <Modal open={!!handling} onClose={() => setHandling(null)} title={handling?.decision === "resolved" ? "Resolve this report" : "Dismiss this report"}
        footer={<><button className="btn-ghost" onClick={() => setHandling(null)}>Cancel</button><button className={handling?.decision === "resolved" ? "btn-primary" : "btn-outline"} onClick={submit} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}{handling?.decision === "resolved" ? "Resolve" : "Dismiss"}</button></>}>
        {handling?.decision === "resolved" && handling.report.targetType === "comment" && !handling.report.removed && (
          <label className="mb-4 flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={removeComment} onChange={(e) => setRemoveComment(e.target.checked)} className="accent-brand" />
            Remove the comment (it shows as removed by a moderator)
          </label>
        )}
        {handling?.decision === "resolved" && handling.report.targetType !== "comment" && (
          <p className="mb-4 text-sm text-ink-muted">Fix the {handling.report.targetType} with its instructor first; resolving only closes the report.</p>
        )}
        <TextArea label="Note to the reporter (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </Modal>
    </div>
  );
}

export default function AdminReportsPage() {
  return <Suspense><ReportsInner /></Suspense>;
}
