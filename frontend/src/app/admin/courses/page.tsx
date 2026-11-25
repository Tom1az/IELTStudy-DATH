"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, CheckCircle2, Eye, XCircle } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api";
import type { AdminCourse } from "@/lib/api";
import { SKILL_CATEGORIES } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { SKILL_META, cx, fmtDate, timeAgo } from "@/lib/format";
import { ConfirmDialog, EmptyState, ErrorState, Modal, PageHeader, PageLoader, Pagination, Spinner, TextArea, useToast } from "@/components/ui";
import { CourseStatusPill } from "@/components/studio/CourseStatusPill";

function AdminCoursesInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [page, setPage] = useState(Number(sp.get("page") ?? 1) || 1);
  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    router.replace(`/admin/courses${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }, [page, router]);
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => adminApi.courses(), []);
  const [review, setReview] = useState<{ course: AdminCourse; decision: "approve" | "reject" } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [err, setErr] = useState<string>();
  const [pending, setPending] = useState(false);
  const [archiving, setArchiving] = useState<AdminCourse | null>(null);

  if (loading && !data) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;
  const waiting = data.filter((c) => c.status === "pending");
  const others = data.filter((c) => c.status !== "pending");
  const PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(others.length / PER_PAGE));
  const current = Math.min(page, totalPages);
  const shown = others.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const submit = async () => {
    if (!review) return;
    setPending(true);
    setErr(undefined);
    try {
      await adminApi.reviewCourse(review.course.id, review.decision, feedback);
      toast(review.decision === "approve" ? `${review.course.title} is now in the catalog.` : "Sent back to the instructor with your feedback.");
      setReview(null);
      setFeedback("");
      reload(true);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErr(e.fields.feedback);
      else toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  const archive = async (c: AdminCourse) => {
    setArchiving(null);
    try {
      await adminApi.archiveCourse(c.id);
      toast("Course archived.");
      reload(true);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Admin" title="Courses & review">Instructors submit courses for review. Approving puts the course in the catalog; rejecting sends your feedback to the instructor.</PageHeader>

      <h2 className="mb-3 text-xl font-extrabold">Waiting for review ({waiting.length})</h2>
      {waiting.length === 0 ? <div className="card"><EmptyState title="Review queue is empty" /></div> : (
        <div className="space-y-3">
          {waiting.map((c) => (
            <article key={c.id} className="card flex flex-col gap-4 p-5 md:flex-row md:items-center">
              <div className="flex-1">
                <p className="text-xs text-ink-muted">Level {c.level} · by {c.instructorName} · submitted {timeAgo(c.submittedAt)}</p>
                <h3 className="mt-1 text-xl font-extrabold">{c.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{c.description}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{SKILL_CATEGORIES.filter((s) => c.skillCounts[s]).map((s) => <span key={s} className={cx("pill", SKILL_META[s].chip)}>{SKILL_META[s].label} · {c.skillCounts[s]}</span>)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/courses/${c.id}`} className="btn-outline btn-sm"><Eye className="h-3.5 w-3.5" /> Preview</Link>
                <button className="btn-ghost btn-sm text-danger" onClick={() => { setReview({ course: c, decision: "reject" }); setFeedback(""); }}><XCircle className="h-3.5 w-3.5" /> Request changes</button>
                <button className="btn-primary btn-sm" onClick={() => { setReview({ course: c, decision: "approve" }); setFeedback(""); }}><CheckCircle2 className="h-3.5 w-3.5" /> Approve</button>
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-10 text-xl font-extrabold">All courses</h2>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="table-base min-w-[760px]">
          <thead><tr><th>Course</th><th>Instructor</th><th>Status</th><th>Lessons</th><th>Updated</th><th /></tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}>
                <td><p className="font-semibold">{c.title}</p><p className="text-xs text-ink-muted">Level {c.level} · {c.levelName}</p></td>
                <td>{c.instructorName}</td>
                <td><CourseStatusPill status={c.status} /></td>
                <td>{c.lessonCount}</td>
                <td className="text-ink-muted">{fmtDate(c.updatedAt)}</td>
                {/* "hidden" is an archived course, which is permanent */}
                <td>{c.status !== "hidden" && <button className="btn-ghost btn-sm" onClick={() => setArchiving(c)}><Archive className="h-3.5 w-3.5" /> Archive</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-center"><Pagination page={current} totalPages={totalPages} onChange={setPage} /></div>

      <Modal open={!!review} onClose={() => setReview(null)} title={review?.decision === "approve" ? `Approve ${review?.course.title}?` : `Request changes to ${review?.course.title}`}
        footer={<><button className="btn-ghost" onClick={() => setReview(null)}>Cancel</button><button className={review?.decision === "approve" ? "btn-primary" : "btn-danger"} onClick={submit} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}{review?.decision === "approve" ? "Approve" : "Send feedback"}</button></>}>
        <p className="mb-4 text-sm text-ink-muted">{review?.decision === "approve" ? "The course appears in the catalog immediately. Feedback is optional." : "The instructor sees this message on the course and can resubmit after editing."}</p>
        <TextArea label={review?.decision === "approve" ? "Comment (optional)" : "What needs to change"} value={feedback} onChange={(e) => setFeedback(e.target.value)} error={err} />
      </Modal>
      <ConfirmDialog open={!!archiving} onClose={() => setArchiving(null)} danger title={`Archive ${archiving?.title}?`} confirmLabel="Archive"
        onConfirm={() => archive(archiving!)} body={<>The course leaves the catalog for good. Learner history is kept.</>} />
    </div>
  );
}

export default function AdminCourses() {
  return (
    <Suspense>
      <AdminCoursesInner />
    </Suspense>
  );
}
