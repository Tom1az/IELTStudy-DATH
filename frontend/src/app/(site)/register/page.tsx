"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { authApi, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Alert, Select, Spinner, TextInput } from "@/components/ui";
import { AuthShell } from "@/components/layout/AuthShell";

const BANDS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5];

function RegisterInner() {
  const { setUser } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next");
  const [form, setForm] = useState({ name: "", email: "", password: "", targetBand: 7 });
  const [agree, setAgree] = useState(false);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<Error | null>(null);
  const fields = err instanceof ApiError ? err.fields ?? {} : {};

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agree) return setErr(new ApiError(422, "VALIDATION_ERROR", "", { agree: "Please accept the terms to continue." }));
    setPending(true);
    setErr(null);
    try {
      const res = await authApi.register(form);
      setUser(res.user);
      router.replace(next && next.startsWith("/") ? next : "/placement");
    } catch (x) {
      setErr(x as Error);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle={<>Already have one? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">Log in</Link></>}>
      <form className="space-y-4" onSubmit={submit} noValidate>
        {err && !Object.keys(fields).length && <Alert tone="error">{err.message}</Alert>}
        <TextInput label="Full name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={fields.name} />
        <TextInput label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={fields.email} />
        <TextInput label="Password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={fields.password} hint="At least 8 characters with a letter and a number." />
        <Select label="Target band" value={form.targetBand} onChange={(e) => setForm({ ...form, targetBand: Number(e.target.value) })} error={fields.targetBand}>
          {BANDS.map((b) => <option key={b} value={b}>Band {b.toFixed(1)}</option>)}
        </Select>
        <label className="flex items-start gap-2.5 text-sm text-ink-muted">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-navy" />
          <span>I agree that my practice data is used to personalise recommendations. IELTStudy is not affiliated with the owners of the IELTS test.</span>
        </label>
        {fields.agree && <p className="-mt-2 text-xs font-medium text-danger">{fields.agree}</p>}
        <button className="btn-primary w-full py-3" disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Create account</button>
        <p className="text-center text-xs text-ink-soft">Next, a placement quiz sets up your skill map.</p>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return <Suspense><RegisterInner /></Suspense>;
}
