"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, XCircle } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api";
import type { Course } from "@/lib/types";
import { SKILL_CATEGORIES } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { SKILL_META, cx, fmtDate, timeAgo } from "@/lib/format";
import { EmptyState, ErrorState, Modal, PageHeader, PageLoader, Spinner, TextArea, useToast } from "@/components/ui";
import { CourseStatusPill } from "@/components/studio/CourseStatusPill";

export default function AdminCourses() {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => adminApi.courses(), []);
  const [review, setReview] = useState<{ course: Course; decision: "approve" | "reject" } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [err, setErr] = useState<string>();
  const [pending, setPending] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const pending_ = data.filter((c) => c.status === "pending");
  const others = data.filter((c) => c.status !== "pending");

  const submit = async () => {
    if (!review) return;
    setPending(true);
    setErr(undefined);
    try {
      await adminApi.reviewCourse(review.course.id, review.decision, feedback);
      toast(review.decision === "approve" ? `${review.course.title} is now published.` : "Sent back to the instructor with your feedback.");
      setReview(null);
      setFeedback("");
      reload(true);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErr(e.fields.feedback); else toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  const toggle = async (c: Course) => {
    try { await adminApi.setCourseStatus(c.id, c.status === "hidden" ? "published" : "hidden"); toast(c.status === "hidden" ? "Course published." : "Course hidden."); reload(true); } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Admin" title="Courses & review">Instructors submit courses for review. Approving publishes the course and all its draft lessons.</PageHeader>

      <h2 className="mb-3 font-serif text-xl font-bold">Waiting for review ({pending_.length})</h2>
      {pending_.length === 0 ? <div className="card"><EmptyState title="Review queue is empty" /></div> : (
        <div className="space-y-3">
          {pending_.map((c) => (
            <article key={c.id} className="card flex flex-col gap-4 p-5 md:flex-row md:items-center">
              <div className="flex-1">
                <p className="text-xs text-ink-muted">Level {c.level} · {c.bandRange} · by {c.instructorName} · submitted {timeAgo(c.submittedAt)}</p>
                <h3 className="mt-1 font-serif text-xl font-bold">{c.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{c.catalogBlurb}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{SKILL_CATEGORIES.filter((s) => c.skillCounts[s]).map((s) => <span key={s} className={cx("pill", SKILL_META[s].chip)}>{SKILL_META[s].label} · {c.skillCounts[s]}</span>)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/courses/${c.slug}`} className="btn-outline btn-sm"><Eye className="h-3.5 w-3.5" /> Preview</Link>
                <button className="btn-ghost btn-sm text-danger" onClick={() => { setReview({ course: c, decision: "reject" }); setFeedback(""); }}><XCircle className="h-3.5 w-3.5" /> Request changes</button>
                <button className="btn-primary btn-sm" onClick={() => { setReview({ course: c, decision: "approve" }); setFeedback(""); }}><CheckCircle2 className="h-3.5 w-3.5" /> Approve</button>
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-10 font-serif text-xl font-bold">All courses</h2>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="table-base min-w-[760px]">
          <thead><tr><th>Course</th><th>Instructor</th><th>Status</th><th>Lessons</th><th>Learners</th><th>Updated</th><th /></tr></thead>
          <tbody>
            {others.map((c) => (
              <tr key={c.id}>
                <td><p className="font-semibold">{c.title}</p><p className="text-xs text-ink-muted">Level {c.level} · {c.bandRange}</p></td>
                <td>{c.instructorName}</td>
                <td><CourseStatusPill status={c.status} /></td>
                <td>{c.lessonCount}</td>
                <td>{c.learners}</td>
                <td className="text-ink-muted">{fmtDate(c.updatedAt)}</td>
                <td>{(c.status === "published" || c.status === "hidden") && <button className="btn-ghost btn-sm" onClick={() => toggle(c)}>{c.status === "hidden" ? <><Eye className="h-3.5 w-3.5" /> Publish</> : <><EyeOff className="h-3.5 w-3.5" /> Hide</>}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!review} onClose={() => setReview(null)} title={review?.decision === "approve" ? `Approve ${review?.course.title}?` : `Request changes to ${review?.course.title}`}
        footer={<><button className="btn-ghost" onClick={() => setReview(null)}>Cancel</button><button className={review?.decision === "approve" ? "btn-primary" : "btn-danger"} onClick={submit} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}{review?.decision === "approve" ? "Approve and publish" : "Send feedback"}</button></>}>
        <p className="mb-4 text-sm text-ink-muted">{review?.decision === "approve" ? "The course appears in the catalogue immediately. Feedback is optional." : "The instructor sees this message on the course and can resubmit after editing."}</p>
        <TextArea label={review?.decision === "approve" ? "Comment (optional)" : "What needs to change"} value={feedback} onChange={(e) => setFeedback(e.target.value)} error={err} />
      </Modal>
    </div>
  );
}
