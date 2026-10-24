"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Info, X } from "lucide-react";
import type { SkillCategory } from "@/lib/types";
import { SKILL_META, cx, initials } from "@/lib/format";
import { ApiError } from "@/lib/api/client";

/* ───────── Skill chip / badges ───────── */

export function SkillChip({ skill, className, size = "sm" }: { skill: SkillCategory; className?: string; size?: "sm" | "md" }) {
  return (
    <span className={cx("pill", SKILL_META[skill].chip, size === "md" && "px-3 py-1 text-xs", className)}>{SKILL_META[skill].label}</span>
  );
}

export function StatusPill({ tone, children }: { tone: "green" | "amber" | "red" | "gray" | "navy" | "orange" | "violet"; children: ReactNode }) {
  const map = {
    green: "bg-teal-tint text-teal-ink",
    amber: "bg-skill-r-bg text-skill-r-ink",
    red: "bg-skill-w-bg text-skill-w-ink",
    gray: "bg-sand text-ink-muted",
    navy: "bg-navy text-white",
    orange: "bg-brand-tint text-peach-ink",
    violet: "bg-skill-s-bg text-skill-s-ink",
  };
  return <span className={cx("pill whitespace-nowrap", map[tone])}>{children}</span>;
}

export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-teal font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/* ───────── Progress ───────── */

export function ProgressBar({ value, max = 100, color = "bg-teal", track = "bg-sand", height = "h-2", label }: { value: number; max?: number; color?: string; track?: string; height?: string; label?: string }) {
  const p = max ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cx("w-full overflow-hidden rounded-full", track, height)} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${p}%` }} />
    </div>
  );
}

/* ───────── States ───────── */

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent", className)} aria-hidden />;
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-3 text-ink-muted" role="status" aria-live="polite">
      <Spinner className="text-navy" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-sand/70", className)} />;
}

export function ErrorState({ error, onRetry }: { error: Error | null; onRetry?: () => void }) {
  const api = error instanceof ApiError ? error : null;
  return (
    <div className="card mx-auto my-10 max-w-lg p-8 text-center" role="alert">
      <AlertCircle className="mx-auto mb-3 h-8 w-8 text-brand" aria-hidden />
      <h2 className="font-serif text-xl font-semibold">{api?.status === 404 ? "Not found" : api?.status === 403 ? "No access" : "Something went wrong"}</h2>
      <p className="mt-2 text-sm text-ink-muted">{error?.message ?? "Please try again."}</p>
      <div className="mt-5 flex justify-center gap-3">
        {onRetry && api?.status !== 404 && api?.status !== 403 && <button className="btn-outline" onClick={onRetry}>Try again</button>}
        <Link href="/" className="btn-ghost">Go home</Link>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-soft">{icon}</div>}
      <p className="font-serif text-lg font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-ink-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "info", children, className }: { tone?: "info" | "error" | "success" | "warn"; children: ReactNode; className?: string }) {
  const map = {
    info: "border-navy/15 bg-white text-ink",
    error: "border-danger/30 bg-[#FDF1EE] text-[#8A2E09]",
    success: "border-teal/30 bg-teal-tint text-teal-ink",
    warn: "border-skill-r/40 bg-skill-r-bg text-skill-r-ink",
  };
  const Icon = tone === "error" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div className={cx("flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm", map[tone], className)} role={tone === "error" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/* ───────── Form fields ───────── */

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="mt-1.5 text-xs font-medium text-danger" role="alert">{error}</p> : hint ? <p className="mt-1.5 text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode }) {
  const { label, error, hint, id, className, ...rest } = props;
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={fid}>
      <input id={fid} className={cx("input", error && "border-danger focus:border-danger focus:ring-danger/15", className)} aria-invalid={!!error} {...rest} />
    </Field>
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: ReactNode }) {
  const { label, error, hint, id, className, ...rest } = props;
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={fid}>
      <textarea id={fid} className={cx("input min-h-[96px] resize-y", error && "border-danger", className)} aria-invalid={!!error} {...rest} />
    </Field>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }) {
  const { label, error, id, className, children, ...rest } = props;
  const auto = useId();
  const fid = id ?? auto;
  const el = (
    <select id={fid} className={cx("input appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%231B2A41%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:14px] bg-[right_12px_center] bg-no-repeat pr-9", className)} {...rest}>
      {children}
    </select>
  );
  return label ? <Field label={label} error={error} htmlFor={fid}>{el}</Field> : el;
}

/* ───────── Modal ───────── */

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    setTimeout(() => ref.current?.querySelector<HTMLElement>("input, textarea, select, button:not([data-close])")?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cx("max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <h2 className="font-serif text-lg font-semibold">{title}</h2>
          <button data-close className="rounded-lg p-1.5 text-ink-muted hover:bg-sand" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-line bg-white px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel = "Confirm", danger, onConfirm, onClose, pending }: { open: boolean; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void; pending?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<>
      <button className="btn-ghost" onClick={onClose}>Cancel</button>
      <button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}{confirmLabel}</button>
    </>}>
      <div className="text-sm text-ink-muted">{body}</div>
    </Modal>
  );
}

/* ───────── Toast ───────── */

type ToastItem = { id: number; tone: "success" | "error" | "info"; text: string };
const ToastCtx = createContext<(text: string, tone?: ToastItem["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: ToastItem["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, tone, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx("pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg", t.tone === "error" ? "bg-[#8A2E09]" : t.tone === "info" ? "bg-navy" : "bg-teal")}>
            {t.tone === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ───────── Pagination / Tabs ───────── */

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1);
  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="Pagination">
      <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
      {pages.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && pages[i - 1] !== p - 1 && <span className="px-1 text-ink-soft">…</span>}
          <button onClick={() => onChange(p)} aria-current={p === page ? "page" : undefined} className={cx("h-8 min-w-8 rounded-lg px-2 text-sm font-semibold", p === page ? "bg-navy text-white" : "text-ink hover:bg-sand")}>{p}</button>
        </span>
      ))}
      <button className="btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
    </nav>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void; className?: string }) {
  return (
    <div className={cx("flex gap-6 overflow-x-auto border-b border-line scrollbar-thin", className)} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={cx("tab whitespace-nowrap", value === t.id && "tab-active")} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}

export function StatCard({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="card p-5">
      <p className="eyebrow-muted">{label}</p>
      <p className={cx("mt-2 font-serif text-3xl font-semibold", accent)}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-serif text-3xl font-semibold leading-tight md:text-[40px]">{title}</h1>
        {children && <div className="mt-2 max-w-2xl text-ink-muted">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
