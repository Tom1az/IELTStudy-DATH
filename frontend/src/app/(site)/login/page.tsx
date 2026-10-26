"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { homeFor, useAuth } from "@/lib/auth-context";
import { Alert, Spinner, TextInput } from "@/components/ui";
import { AuthShell } from "@/components/layout/AuthShell";

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErr(null);
    try {
      const u = await login(email, password);
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
        <button className="btn-primary w-full py-3" disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Log in</button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}
