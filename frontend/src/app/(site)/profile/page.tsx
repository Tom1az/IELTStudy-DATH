"use client";

import { useState } from "react";
import { authApi, ApiError, USING_MOCK } from "@/lib/api";
import { RequireRole, useAuth } from "@/lib/auth-context";
import { Avatar, PageHeader, Select, Spinner, StatusPill, TextArea, TextInput, useToast } from "@/components/ui";
import { band, fmtDate } from "@/lib/format";

const BANDS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];

function ProfileInner() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: user!.name, targetBand: user!.targetBand, bio: user!.bio ?? "" });
  const [prefs, setPrefs] = useState(user!.notificationPrefs);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pending, setPending] = useState<"" | "profile" | "prefs" | "pw">("");
  const [errs, setErrs] = useState<Record<string, string>>({});

  const save = async (kind: "profile" | "prefs") => {
    setPending(kind);
    setErrs({});
    try {
      const u = await authApi.updateProfile(kind === "profile" ? form : { notificationPrefs: prefs });
      setUser(u);
      toast(kind === "profile" ? "Profile saved." : "Notification settings saved.");
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrs(e.fields); else toast((e as Error).message, "error");
    } finally {
      setPending("");
    }
  };

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return setErrs({ confirm: "Passwords don't match." });
    setPending("pw");
    setErrs({});
    try {
      await authApi.changePassword(pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      toast("Password changed.");
    } catch (x) {
      if (x instanceof ApiError && x.fields) setErrs(x.fields); else toast((x as Error).message, "error");
    } finally {
      setPending("");
    }
  };

  const u = user!;
  return (
    <div className="container max-w-4xl pb-16 pt-10 md:pt-12">
      <PageHeader eyebrow="Account" title="Profile & settings" />
      <div className="card mb-6 flex flex-wrap items-center gap-4 p-5">
        <Avatar name={u.name} size={56} />
        <div className="flex-1">
          <p className="font-serif text-xl font-bold">{u.name}</p>
          <p className="text-sm text-ink-muted">{u.email} · Joined {fmtDate(u.createdAt)}</p>
        </div>
        <StatusPill tone="navy">{u.role}</StatusPill>
        {u.role === "learner" && u.placementDone && <StatusPill tone="green">Placement Band {band(u.placementBand)}</StatusPill>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6" aria-labelledby="p-h">
          <h2 id="p-h" className="font-serif text-xl font-bold">Profile</h2>
          <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); save("profile"); }}>
            <TextInput label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errs.name} />
            {u.role === "learner" && (
              <Select label="Target band" value={form.targetBand} onChange={(e) => setForm({ ...form, targetBand: Number(e.target.value) })} error={errs.targetBand}>
                {BANDS.map((b) => <option key={b} value={b}>Band {b.toFixed(1)}</option>)}
              </Select>
            )}
            <TextArea label={u.role === "learner" ? "Your goal (optional)" : "Bio shown on your courses"} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={400} />
            <button className="btn-dark" disabled={pending === "profile"}>{pending === "profile" && <Spinner className="h-4 w-4" />}Save profile</button>
          </form>
        </section>

        <section className="card p-6" aria-labelledby="n-h">
          <h2 id="n-h" className="font-serif text-xl font-bold">Notifications</h2>
          <div className="mt-4 space-y-3">
            {([
              ["newContent", "New lessons and resources in my courses"],
              ["deadlines", "Writing task deadlines"],
              ["results", "Practice results and grades"],
              ["email", "Also send a copy by email"],
            ] as const).map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-line px-3.5 py-3">
                <span className="text-sm">{label}</span>
                <input type="checkbox" role="switch" checked={prefs[k]} onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })} className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-[#D9D3C5] transition-colors before:block before:h-4 before:w-4 before:translate-x-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-teal checked:before:translate-x-[18px]" />
              </label>
            ))}
            <button className="btn-dark" onClick={() => save("prefs")} disabled={pending === "prefs"}>{pending === "prefs" && <Spinner className="h-4 w-4" />}Save settings</button>
          </div>
        </section>

        <section className="card p-6 lg:col-span-2" aria-labelledby="pw-h">
          <h2 id="pw-h" className="font-serif text-xl font-bold">Change password</h2>
          <form className="mt-4 grid gap-4 md:grid-cols-3" onSubmit={changePw}>
            <TextInput label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} error={errs.current} />
            <TextInput label="New password" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} error={errs.next} hint="8+ characters, a letter and a number." />
            <TextInput label="Confirm new password" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} error={errs.confirm} />
            <div className="md:col-span-3"><button className="btn-dark" disabled={pending === "pw"}>{pending === "pw" && <Spinner className="h-4 w-4" />}Update password</button></div>
          </form>
          {USING_MOCK && <p className="mt-4 text-xs text-ink-soft">Demo mode: passwords are hashed (SHA-256 with salt) and stored in this browser only.</p>}
        </section>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return <RequireRole><ProfileInner /></RequireRole>;
}
