"use client";

import { useState } from "react";
import { ScrollText } from "lucide-react";
import { adminApi, auditActionLabel } from "@/lib/api";
import type { AuditEntry } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { cx, fmtDate, timeAgo } from "@/lib/format";
import { Avatar, EmptyState, ErrorState, PageHeader, PageLoader, Pagination, Select, StatusPill } from "@/components/ui";
import { NotAvailable } from "@/components/NotAvailable";

/** Destructive or irreversible actions are the ones an admin scans for, so they are tinted. */
function ActionPill({ action }: { action: string }) {
  const verb = action.split(".")[1] ?? "";
  const tone = /delete|reject|suspend|archive|remove/.test(verb) ? "red" : /approve|create|restore/.test(verb) ? "green" : "gray";
  return <StatusPill tone={tone}>{auditActionLabel(action)}</StatusPill>;
}

function Actor({ actor }: { actor: AuditEntry["actor"] }) {
  // Nothing signed in did it: a scheduled job, a cascade, the seed script
  if (!actor) return <span className="text-ink-soft">System</span>;
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={actor.name} size={30} />
      <div className="min-w-0">
        <p className="truncate font-semibold">{actor.name}</p>
        <p className="text-xs capitalize text-ink-muted">{actor.role}</p>
      </div>
    </div>
  );
}

export default function AuditLogPage() {
  const [action, setAction] = useState("all");
  const [actorId, setActorId] = useState("all");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => adminApi.audit({ action, actorId, page }), [action, actorId, page]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <PageLoader label="Reading the log…" />;
  // The backend doesn't record an audit log yet
  if (!data) {
    return (
      <NotAvailable eyebrow="Admin" title="Audit log">
        The backend does not record an audit log yet. This page starts working as soon as <code>GET /admin/audit</code> answers.
      </NotAvailable>
    );
  }

  const reset = () => { setAction("all"); setActorId("all"); setPage(1); };
  const filtered = action !== "all" || actorId !== "all";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Admin" title="Audit log">
        Every change staff made to accounts and courses, newest first. Entries are kept as they were written and can&apos;t be edited here.
      </PageHeader>

      <div className="mb-4 grid gap-3 md:grid-cols-[220px_220px_1fr]">
        <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label="Action">
          <option value="all">All actions</option>
          {data.actions.map((a) => <option key={a} value={a}>{auditActionLabel(a)}</option>)}
        </Select>
        <Select value={actorId} onChange={(e) => { setActorId(e.target.value); setPage(1); }} aria-label="Who did it">
          <option value="all">Anyone</option>
          {data.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        {filtered && (
          <div className="flex items-center">
            <button className="btn-ghost btn-sm" onClick={reset}>Clear filters</button>
          </div>
        )}
      </div>

      <div className={cx("overflow-x-auto rounded-2xl border border-line bg-white transition-opacity duration-200", loading && "opacity-60")}>
        {data.items.length === 0 ? (
          <EmptyState icon={<ScrollText className="h-6 w-6" />} title={filtered ? "Nothing matches those filters" : "The log is empty"}>
            {filtered ? "Try a wider action or another person." : "Entries appear here as soon as staff change an account or a course."}
          </EmptyState>
        ) : (
          <table className="table-base min-w-[760px]">
            <thead><tr><th>When</th><th>Action</th><th>Who</th><th>Target</th><th>Details</th></tr></thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">
                    <p className="font-semibold">{timeAgo(e.at)}</p>
                    <p className="text-xs text-ink-muted">{fmtDate(e.at, true)}</p>
                  </td>
                  <td><ActionPill action={e.action} /></td>
                  <td><Actor actor={e.actor} /></td>
                  <td className="whitespace-nowrap text-ink-muted">{e.target || "—"}</td>
                  <td className="max-w-[320px] text-ink-muted">{e.summary || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-muted">{data.total} {data.total === 1 ? "entry" : "entries"}</p>
        <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
