"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { authApi, ApiError } from "@/lib/api";
import { Alert, Spinner, TextInput } from "@/components/ui";
import { AuthShell } from "@/components/layout/AuthShell";

function ResetInner() {
  const token = useSearchParams().get("token") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<Error | null>(null);
  const fields = err instanceof ApiError ? err.fields ?? {} : {};

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) return setErr(new ApiError(422, "VALIDATION_ERROR", "", { confirm: "Passwords don't match." }));
    setPending(true);
    setErr(null);
    try {
      await authApi.resetPassword(token, pw);
      setDone(true);
    } catch (x) {
      setErr(x as Error);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell title="Choose a new password">
      {done ? (
        <div className="space-y-4">
          <Alert tone="success">Your password has been changed. You can now log in with the new password.</Alert>
          <Link href="/login" className="btn-primary w-full">Log in</Link>
        </div>
      ) : !token ? (
        <Alert tone="error">This reset link is missing its token. <Link href="/forgot-password" className="link">Request a new link</Link>.</Alert>
      ) : (
        <form className="space-y-4" onSubmit={submit} noValidate>
          {err && !Object.keys(fields).length && <Alert tone="error">{err.message} {err instanceof ApiError && err.code === "INVALID_TOKEN" && <Link href="/forgot-password" className="link">Request a new link</Link>}</Alert>}
          <TextInput label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={fields.password} hint="At least 8 characters with a letter and a number." />
          <TextInput label="Confirm new password" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} error={fields.confirm} />
          <button className="btn-primary w-full py-3" disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Save new password</button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetInner /></Suspense>;
}
