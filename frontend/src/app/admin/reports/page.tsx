"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import type { ContentReport } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { timeAgo } from "@/lib/format";
import { EmptyState, ErrorState, Modal, PageHeader, PageLoader, Spinner, StatusPill, Tabs, TextArea, useToast } from "@/components/ui";

type Action = "hide_content" | "dismiss" | "suspend_author";

export default function ReportsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<ContentReport["status"] | "all">("open");
  const { data, error, loading, reload } = useAsync(() => adminApi.reports(tab), [tab]);
  const [acting, setActing] = useState<{ r: ContentReport; action: Action } | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  const resolve = async () => {
    if (!acting) return;
    setPending(true);
    try {
      await adminApi.resolveReport(acting.r.id, acting.action, note);
      toast(acting.action === "dismiss" ? "Report dismissed." : "Action taken. The reporter has been notified.");
      setActing(null);
      setNote("");
      reload(true);
    } catch (e) { toast((e as Error).message, "error"); } finally { setPending(false); }
  };

  const label: Record<Action, string> = { hide_content: "Hide content", dismiss: "Dismiss report", suspend_author: "Hide and suspend author" };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Admin" title="Content reports">Reports from learners about posts, lessons and questions. Reported questions are forwarded to the course instructor.</PageHeader>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "open", label: "Open" }, { id: "resolved", label: "Resolved" }, { id: "dismissed", label: "Dismissed" }, { id: "all", label: "All" }]} />
      <div className="mt-4">
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <PageLoader /> : !data?.length ? <div className="card"><EmptyState title={tab === "open" ? "No open reports" : "Nothing here"} /></div> : (
          <ul className="space-y-3">
            {data.map((r) => (
              <li key={r.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <StatusPill tone={r.status === "open" ? "orange" : r.status === "resolved" ? "green" : "gray"}>{r.status}</StatusPill>
                  <StatusPill tone="navy">{r.targetType}</StatusPill>
                  <span>Reported by {r.reporterName} · {timeAgo(r.createdAt)}</span>
                </div>
                <p className="mt-3 text-sm font-semibold">{r.reason}</p>
                <blockquote className="mt-2 rounded-lg bg-cream px-3 py-2 text-sm text-ink-muted">“{r.targetPreview}”</blockquote>
                {r.details && <p className="mt-2 text-sm">{r.details}</p>}
                {r.resolution && <p className="mt-2 text-xs text-ink-muted">Handled by {r.resolvedBy}: {r.resolution}</p>}
                {r.status === "open" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="btn-ghost btn-sm" onClick={() => setActing({ r, action: "dismiss" })}>Dismiss</button>
                    <button className="btn-dark btn-sm" onClick={() => setActing({ r, action: "hide_content" })}>{r.targetType === "post" ? "Hide post" : "Flag to instructor"}</button>
                    {r.targetType === "post" && <button className="btn-danger btn-sm" onClick={() => setActing({ r, action: "suspend_author" })}>Hide & suspend author</button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal open={!!acting} onClose={() => setActing(null)} title={acting ? label[acting.action] : ""} footer={<><button className="btn-ghost" onClick={() => setActing(null)}>Cancel</button><button className={acting?.action === "suspend_author" ? "btn-danger" : "btn-primary"} onClick={resolve} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Confirm</button></>}>
        <TextArea label="Note for the audit log" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why you took this action" />
      </Modal>
    </div>
  );
}
