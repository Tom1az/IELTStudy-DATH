"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { discussionApi } from "@/lib/api";
import type { LessonComment } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cx, timeAgo } from "@/lib/format";
import { Avatar, ConfirmDialog, Spinner, useToast } from "@/components/ui";
import { ReportButton } from "@/components/ReportButton";

const PAGE_SIZE = 10;

/** A textarea with a submit button, for a new comment, a reply or an edit. */
function Composer({ initial = "", placeholder, submitLabel, onSubmit, onCancel, autoFocus }: {
  initial?: string; placeholder: string; submitLabel: string; onSubmit: (body: string) => Promise<void>; onCancel?: () => void; autoFocus?: boolean;
}) {
  const [body, setBody] = useState(initial);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    try {
      await onSubmit(body);
      setBody("");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setPending(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label className="sr-only" htmlFor={`composer-${placeholder}`}>{placeholder}</label>
      <textarea id={`composer-${placeholder}`} className="input min-h-[76px] resize-y" placeholder={placeholder} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} autoFocus={autoFocus} />
      <div className="flex justify-end gap-2">
        {onCancel && <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn-primary btn-sm" disabled={pending || !body.trim()}>{pending && <Spinner className="h-3.5 w-3.5" />}{submitLabel}</button>
      </div>
    </form>
  );
}

function CommentItem({ comment, isReply, onReply, onChanged }: {
  comment: LessonComment; isReply?: boolean; onReply?: () => void; onChanged: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (comment.removed) {
    return <p id={`comment-${comment.id}`} className="py-2 text-sm italic text-ink-soft">{comment.removedByModerator ? "This comment was removed by a moderator." : "This comment was deleted."}</p>;
  }
  const mine = comment.author?.id === user?.id;

  return (
    <div id={`comment-${comment.id}`} className="flex gap-3 py-3">
      <Avatar name={comment.author?.name ?? "?"} size={isReply ? 28 : 34} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold">{comment.author?.name}</span>
          {comment.author && comment.author.role !== "learner" && <span className="ml-1.5 rounded bg-brand-tint px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand">{comment.author.role}</span>}
          <span className="ml-2 text-xs text-ink-soft">{timeAgo(comment.at)}{comment.edited && " · edited"}</span>
        </p>
        {editing ? (
          <div className="mt-2">
            <Composer initial={comment.body ?? ""} placeholder="Edit your comment" submitLabel="Save" autoFocus onCancel={() => setEditing(false)}
              onSubmit={async (body) => { await discussionApi.edit(comment.id, body); setEditing(false); onChanged(); }} />
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-line break-words text-[15px] leading-relaxed text-ink">{comment.body}</p>
        )}
        {!editing && (
          <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs">
            {onReply && <button className="font-semibold text-brand hover:underline" onClick={onReply}>Reply</button>}
            {comment.canEdit && <button className="text-ink-muted hover:text-ink" onClick={() => setEditing(true)}>Edit</button>}
            {comment.canDelete && <button className="text-ink-muted hover:text-danger" onClick={() => setConfirm(true)}>Delete</button>}
            {!mine && <ReportButton targetType="comment" targetId={comment.id} />}
          </div>
        )}
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} danger title="Delete this comment?" confirmLabel="Delete"
        body={mine ? "Replies stay visible under a placeholder." : "It will show as removed by a moderator."}
        onConfirm={async () => {
          setConfirm(false);
          try { await discussionApi.remove(comment.id); onChanged(); } catch (e) { toast((e as Error).message, "error"); }
        }} />
    </div>
  );
}

/** The discussion under a lesson: newest threads first, one level of replies, "Show more" for older threads. */
export function LessonDiscussion({ lessonId }: { lessonId: string }) {
  const [threads, setThreads] = useState<LessonComment[]>([]);
  const [pages, setPages] = useState(1);
  const [meta, setMeta] = useState<{ total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [replyTo, setReplyTo] = useState<string | null>(null);

  // Reloads every page shown so far, so an edit or a delete never drops loaded threads
  const load = useCallback(async (upTo: number) => {
    setError(undefined);
    try {
      const results = await Promise.all(Array.from({ length: upTo }, (_, i) => discussionApi.list(lessonId, i + 1, PAGE_SIZE)));
      setThreads(results.flatMap((r) => r.items));
      setMeta({ total: results[0].total, totalPages: results[0].totalPages });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => { setLoading(true); setPages(1); load(1); }, [load]);

  const refresh = () => load(pages);

  return (
    <section className="mt-12" aria-labelledby="discussion-h">
      <h2 id="discussion-h" className="flex items-center gap-2 text-xl font-extrabold"><MessageSquare className="h-5 w-5 text-brand" aria-hidden /> Discussion{meta && meta.total > 0 && <span className="text-base font-semibold text-ink-muted">({meta.total})</span>}</h2>
      <p className="mt-1 text-sm text-ink-muted">Ask a question or help another learner. Be kind; reported comments are reviewed by an admin.</p>

      <div className="mt-4 rounded-2xl border border-line bg-white p-4">
        <Composer placeholder="Write a comment" submitLabel="Post" onSubmit={async (body) => { await discussionApi.post(lessonId, body); await refresh(); }} />
      </div>

      {loading ? <div className="flex justify-center py-8"><Spinner className="h-5 w-5" /></div> : error ? (
        <p className="mt-4 text-sm text-danger">{error} <button className="font-semibold underline" onClick={refresh}>Try again</button></p>
      ) : threads.length === 0 ? (
        <p className="mt-6 text-center text-sm text-ink-muted">No comments yet. Start the discussion.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-white px-4">
          {threads.map((t) => (
            <li key={t.id} className="py-1">
              <CommentItem comment={t} onReply={t.removed ? undefined : () => setReplyTo(replyTo === t.id ? null : t.id)} onChanged={refresh} />
              {(t.replies.length > 0 || replyTo === t.id) && (
                <div className={cx("mb-2 ml-11 border-l-2 border-line pl-4")}>
                  {t.replies.map((r) => <CommentItem key={r.id} comment={r} isReply onChanged={refresh} />)}
                  {replyTo === t.id && (
                    <div className="py-2">
                      <Composer placeholder={`Reply to ${t.author?.name ?? "this comment"}`} submitLabel="Reply" autoFocus onCancel={() => setReplyTo(null)}
                        onSubmit={async (body) => { await discussionApi.post(lessonId, body, t.id); setReplyTo(null); await refresh(); }} />
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {meta && pages < meta.totalPages && (
        <div className="mt-4 flex justify-center">
          <button className="btn-outline" onClick={() => { const next = pages + 1; setPages(next); load(next); }}>Show more comments</button>
        </div>
      )}
    </section>
  );
}
