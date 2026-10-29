"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { adminApi } from "@/lib/api";
import type { AccountStatus, Role, User } from "@/lib/types";
import { useAsync, useDebounced } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import { fmtDate } from "@/lib/format";
import { Avatar, ConfirmDialog, EmptyState, ErrorState, PageHeader, PageLoader, Pagination, Select, StatusPill, useToast } from "@/components/ui";

export default function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role | "all">("all");
  const [status, setStatus] = useState<AccountStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<{ user: User; kind: "suspend" | "activate" } | null>(null);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useAsync(() => adminApi.users({ q: dq, role, status, page }), [dq, role, status, page]);

  const changeRole = async (u: User, r: Role) => {
    try {
      await adminApi.setRole(u.id, r);
      toast(`${u.name} is now ${r === "learner" ? "a" : "an"} ${r}.`);
      reload(true);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const changeStatus = async () => {
    const c = confirm!;
    try {
      await adminApi.setStatus(c.user.id, c.kind === "suspend" ? "suspended" : "active");
      toast(c.kind === "suspend" ? "Account suspended." : "Account reactivated.");
      setConfirm(null);
      reload(true);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      {/* Accounts are created by signing up; an admin then changes the role */}
      <PageHeader eyebrow="Admin" title="Users">Manage roles and account status. New accounts sign up as learners; promote instructors here.</PageHeader>
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_180px]">
        <label className="relative"><span className="sr-only">Search users</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" /><input className="input pl-9" placeholder="Search name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
        <Select value={role} onChange={(e) => { setRole(e.target.value as Role | "all"); setPage(1); }} aria-label="Role"><option value="all">All roles</option><option value="learner">Learners</option><option value="instructor">Instructors</option><option value="admin">Admins</option></Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value as AccountStatus | "all"); setPage(1); }} aria-label="Status"><option value="all">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option></Select>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <PageLoader /> : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-line bg-white">
            {!data?.items.length ? <EmptyState title="No users match" /> : (
              <table className="table-base min-w-[720px]">
                <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th /></tr></thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id}>
                      <td><div className="flex items-center gap-3"><Avatar name={u.name} size={34} /><div><p className="font-semibold">{u.name}</p><p className="text-xs text-ink-muted">{u.email}</p></div></div></td>
                      <td>
                        {/* Admins can't change their own account (the API answers 409) */}
                        <select className="input h-9 w-[130px] py-1 text-sm" value={u.role} disabled={u.id === me?.id} onChange={(e) => changeRole(u, e.target.value as Role)} aria-label={`Role for ${u.name}`}>
                          <option value="learner">Learner</option><option value="instructor">Instructor</option><option value="admin">Admin</option>
                        </select>
                      </td>
                      <td><StatusPill tone={u.status === "active" ? "green" : "red"}>{u.status}</StatusPill></td>
                      <td className="text-ink-muted">{fmtDate(u.createdAt)}</td>
                      <td>{u.id !== me?.id && (u.status === "active"
                        ? <button className="btn-ghost btn-sm text-danger" onClick={() => setConfirm({ user: u, kind: "suspend" })}>Suspend</button>
                        : <button className="btn-ghost btn-sm text-brand" onClick={() => setConfirm({ user: u, kind: "activate" })}>Reactivate</button>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between"><p className="text-sm text-ink-muted">{data?.total} users</p><Pagination page={data?.page ?? 1} totalPages={data?.totalPages ?? 1} onChange={setPage} /></div>
        </>
      )}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} danger={confirm?.kind === "suspend"} confirmLabel={confirm?.kind === "suspend" ? "Suspend account" : "Reactivate"}
        title={confirm?.kind === "suspend" ? `Suspend ${confirm.user.name}?` : `Reactivate ${confirm?.user.name}?`}
        onConfirm={changeStatus}
        body={confirm?.kind === "suspend" ? <p>They are logged out at once and can&apos;t sign in until reactivated. Their data is kept.</p> : <p>They will be able to sign in again.</p>} />
    </div>
  );
}
