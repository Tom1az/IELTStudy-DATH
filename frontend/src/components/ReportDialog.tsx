"use client";

import { useState } from "react";
import { lessonApi } from "@/lib/api";
import type { ContentReport } from "@/lib/types";
import { Modal, Spinner, TextArea, useToast } from "@/components/ui";

const REASONS: Record<ContentReport["targetType"], string[]> = {
  post: ["Spam or advertising", "Harassment or hate", "Off-topic", "Cheating or selling answers", "Other"],
  lesson: ["Incorrect information", "Video or audio problem", "Copyright concern", "Inappropriate content", "Other"],
  question: ["Answer key seems wrong", "Question is unclear", "Typo or formatting", "Other"],
};

/** Report inappropriate or incorrect content (requirement 4.5). */
export function ReportDialog({ open, onClose, targetType, targetId, targetPreview }: { open: boolean; onClose: () => void; targetType: ContentReport["targetType"]; targetId: string; targetPreview: string }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | undefined>();

  const submit = async () => {
    if (!reason) return setErr("Choose a reason.");
    setPending(true);
    try {
      await lessonApi.report({ targetType, targetId, targetPreview: targetPreview.slice(0, 200), reason, details: details.trim() || undefined });
      toast("Thanks — a moderator will review this.");
      setReason("");
      setDetails("");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={targetType === "post" ? "Report this post" : targetType === "question" ? "Report a problem with this question" : "Report a problem with this lesson"}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Send report</button></>}>
      {targetPreview && <blockquote className="mb-4 rounded-lg bg-sand/60 px-3 py-2 text-sm text-ink-muted">“{targetPreview.slice(0, 160)}{targetPreview.length > 160 ? "…" : ""}”</blockquote>}
      <fieldset>
        <legend className="label">Reason</legend>
        <div className="space-y-2">
          {REASONS[targetType].map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm has-[:checked]:border-navy has-[:checked]:bg-cream">
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => { setReason(r); setErr(undefined); }} className="accent-navy" />
              {r}
            </label>
          ))}
        </div>
        {err && <p className="mt-1.5 text-xs font-medium text-danger" role="alert">{err}</p>}
      </fieldset>
      <div className="mt-4"><TextArea label="Details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} placeholder="Anything that helps us check quickly" /></div>
    </Modal>
  );
}
