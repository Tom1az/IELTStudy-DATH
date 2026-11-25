"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { REPORT_REASONS, submitReport, useReports, type ReportTargetType } from "@/lib/mock/social";
import { Modal, useToast } from "@/components/ui";

interface Props {
  targetType: ReportTargetType;
  targetId: string;
  /** Shown to the admin in the report list, so it should name the content. */
  targetLabel: string;
  variant?: "button" | "link";
}

/** Opens a small form to report a comment or lesson. Disabled after the user has reported it. */
export function ReportButton({ targetType, targetId, targetLabel, variant = "button" }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [error, setError] = useState<string>();
  const reports = useReports("all");

  if (!user) return null;
  const reported = reports.some((r) => r.reporterId === user.id && r.targetType === targetType && r.targetId === targetId);

  const send = () => {
    const res = submitReport({ reporter: { id: user.id, name: user.name }, targetType, targetId, targetLabel, reason });
    if (res.ok) {
      setOpen(false);
      setError(undefined);
      toast("Thanks. An admin will review this.");
    } else {
      setError(res.error);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={reported}
        onClick={() => { setError(undefined); setOpen(true); }}
        className={variant === "link" ? "inline-flex items-center gap-1 hover:text-danger disabled:opacity-50" : "btn-ghost btn-sm disabled:opacity-50"}
      >
        <Flag className="h-3.5 w-3.5" aria-hidden /> {reported ? "Reported" : "Report"}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Report content"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-danger" onClick={send}>Send report</button>
          </>
        }
      >
        <p className="mb-4 text-sm text-ink-muted">Reports go to the admin team. The author is not told who reported.</p>
        <fieldset className="space-y-2.5">
          <legend className="label mb-2">Reason</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3.5 py-3 text-sm hover:border-brand/30">
              <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-brand" />
              {r}
            </label>
          ))}
        </fieldset>
        {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      </Modal>
    </>
  );
}
