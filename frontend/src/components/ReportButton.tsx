"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { ApiError, reportsApi } from "@/lib/api";
import type { ReportTargetType } from "@/lib/api";
import { cx } from "@/lib/format";
import { Modal, Spinner, TextArea, useToast } from "@/components/ui";

const REASONS = ["Spam or advertising", "Rude or offensive", "Wrong or misleading content", "Other"];

/** "Report" link plus the modal that asks why. An admin then reviews it at /admin/reports. */
export function ReportButton({ targetType, targetId, className, label = "Report" }: { targetType: ReportTargetType; targetId: string; className?: string; label?: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    const text = details.trim() ? `${reason}: ${details.trim()}` : reason;
    if (reason === "Other" && !details.trim()) {
      setError("Tell us what is wrong.");
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await reportsApi.create(targetType, targetId, text);
      toast("Thanks. An admin will review it.");
      setOpen(false);
      setDetails("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast("You have already reported this.");
        setOpen(false);
      } else setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx("inline-flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-danger", className)}>
        <Flag className="h-3.5 w-3.5" aria-hidden /> {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Report this ${targetType}`}
        footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-danger" onClick={submit} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Send report</button></>}>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm text-ink-muted">What is the problem?</legend>
          {REASONS.map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm hover:bg-ivory">
              <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-brand" />
              {r}
            </label>
          ))}
        </fieldset>
        <div className="mt-4">
          <TextArea label={reason === "Other" ? "Details" : "Details (optional)"} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={900} error={error} />
        </div>
      </Modal>
    </>
  );
}
