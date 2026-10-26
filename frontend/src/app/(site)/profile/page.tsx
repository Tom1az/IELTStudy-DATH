"use client";

import { useState } from "react";
import { authApi, ApiError } from "@/lib/api";
import { RequireRole, useAuth } from "@/lib/auth-context";
import { Avatar, PageHeader, Select, Spinner, StatusPill, TextInput, useToast } from "@/components/ui";
import { fmtDate } from "@/lib/format";

const BANDS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];

/** The backend profile has a name and a target band. Password changes have no backend yet. */
function ProfileInner() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: user!.name, targetBand: user!.targetBand });
  const [pending, setPending] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErrs({});
    try {
      setUser(await authApi.updateProfile(form));
      toast("Profile saved.");
    } catch (x) {
      if (x instanceof ApiError && x.fields) setErrs(x.fields);
      else toast((x as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  const u = user!;
  return (
    <div className="container max-w-3xl pb-16 pt-10 md:pt-12">
      <PageHeader eyebrow="Account" title="Profile" />
      <div className="card mb-6 flex flex-wrap items-center gap-4 p-5">
        <Avatar name={u.name} size={56} />
        <div className="flex-1">
          <p className="font-serif text-xl font-bold">{u.name}</p>
          <p className="text-sm text-ink-muted">{u.email} · Joined {fmtDate(u.createdAt)}</p>
        </div>
        <StatusPill tone="navy">{u.role}</StatusPill>
        {u.role === "learner" && u.placementDone && <StatusPill tone="green">Placement done</StatusPill>}
      </div>

      <section className="card p-6" aria-labelledby="p-h">
        <h2 id="p-h" className="font-serif text-xl font-bold">Profile</h2>
        <form className="mt-4 space-y-4" onSubmit={save}>
          <TextInput label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errs.name} />
          {u.role === "learner" && (
            <Select label="Target band" value={form.targetBand} onChange={(e) => setForm({ ...form, targetBand: Number(e.target.value) })} error={errs.targetBand}>
              {/* 0 means no target has been set yet */}
              {form.targetBand === 0 && <option value={0} disabled>Choose a band…</option>}
              {BANDS.map((b) => <option key={b} value={b}>Band {b.toFixed(1)}</option>)}
            </Select>
          )}
          <button className="btn-dark" disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Save profile</button>
        </form>
      </section>
    </div>
  );
}

export default function ProfilePage() {
  return <RequireRole><ProfileInner /></RequireRole>;
}
