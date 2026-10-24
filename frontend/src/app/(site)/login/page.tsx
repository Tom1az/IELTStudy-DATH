"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ApiError, USING_MOCK } from "@/lib/api";
import { homeFor, useAuth } from "@/lib/auth-context";
import { Alert, Spinner, TextInput } from "@/components/ui";
import { AuthShell } from "@/components/layout/AuthShell";

const DEMO = [
  { role: "Learner", email: "learner@ieltstudy.dev", note: "Mira Evans · Level 2 in progress" },
  { role: "Instructor", email: "instructor@ieltstudy.dev", note: "Hannah Cole · owns Levels 1–2" },
  { role: "Admin", email: "admin@ieltstudy.dev", note: "Admin Kim · full access" },
];

function LoginInner() {
  const { login, user } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<ApiError | Error | null>(null);

  useEffect(() => { if (user) router.replace(next ?? homeFor(user.role)); }, [user, next, router]);

  const submit = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setPending(true);
    setErr(null);
    try {
      const u = await login(creds?.email ?? email, creds?.password ?? password);
      router.replace(next && next.startsWith("/") ? next : homeFor(u.role));
    } catch (x) {
      setErr(x as Error);
    } finally {
      setPending(false);
    }
  };
  const fields = err instanceof ApiError ? err.fields ?? {} : {};

  return (
    <AuthShell title="Log in" subtitle={<>New to IELTStudy? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">Create an account</Link></>}>
      <form className="space-y-4" onSubmit={submit} noValidate>
        {err && !Object.keys(fields).length && <Alert tone="error">{err.message}</Alert>}
        <TextInput label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} required />
        <TextInput label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} required />
        <div className="flex justify-end"><Link href="/forgot-password" className="text-sm font-semibold text-brand hover:underline">Forgot password?</Link></div>
        <button className="btn-primary w-full py-3" disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Log in</button>
      </form>
      {USING_MOCK && (
        <div className="mt-7 rounded-xl border border-dashed border-[#C9BFA9] bg-cream p-4">
          <p className="text-xs font-semibold uppercase tracking-eyebrow text-ink-soft">Demo accounts · password Password123!</p>
          <div className="mt-3 grid gap-2">
            {DEMO.map((d) => (
              <button key={d.email} type="button" disabled={pending} onClick={() => { setEmail(d.email); setPassword("Password123!"); submit(undefined, { email: d.email, password: "Password123!" }); }}
                className="flex items-center justify-between rounded-lg border border-line bg-white px-3 py-2 text-left text-sm hover:border-navy">
                <span><strong>{d.role}</strong> <span className="text-ink-muted">· {d.note}</span></span>
                <span className="text-xs font-semibold text-brand">Log in →</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}
