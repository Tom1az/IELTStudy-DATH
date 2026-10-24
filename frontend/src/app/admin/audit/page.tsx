"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { adminApi } from "@/lib/api";
import { useAsync, useDebounced } from "@/lib/hooks";
import { fmtDate } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, PageLoader, Pagination } from "@/components/ui";

export default function AuditPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useAsync(() => adminApi.audit({ q: dq, page }), [dq, page]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Admin" title="Audit log">Important administrative actions: role and status changes, course reviews, moderation and deletions.</PageHeader>
      <label className="relative mb-4 block max-w-md"><span className="sr-only">Search the log</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" /><input className="input pl-9" placeholder="Search action, target or person" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <PageLoader /> : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-line bg-white">
            {!data?.items.length ? <EmptyState title="No entries" /> : (
              <table className="table-base min-w-[700px]">
                <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
                <tbody>{data.items.map((a) => <tr key={a.id}><td className="whitespace-nowrap text-ink-muted">{fmtDate(a.createdAt, true)}</td><td>{a.actorName}</td><td><code className="rounded bg-sand px-1.5 py-0.5 text-xs">{a.action}</code></td><td>{a.target}</td><td className="text-ink-muted">{a.detail ?? "—"}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="mt-4"><Pagination page={data?.page ?? 1} totalPages={data?.totalPages ?? 1} onChange={setPage} /></div>
        </>
      )}
    </div>
  );
}
