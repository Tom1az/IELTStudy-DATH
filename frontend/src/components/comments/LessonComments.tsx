"use client";

import Link from "next/link";
import { useState } from "react";
import { MessageSquare } from "lucide-react";
import type { User } from "@/lib/types";
import { addComment, deleteComment, editComment, useLessonComments, type LessonComment } from "@/lib/mock/social";
import { Avatar, ConfirmDialog } from "@/components/ui";
import { ReportButton } from "@/components/reports/ReportButton";
import { timeAgo } from "@/lib/format";

const PAGE = 3;
const REPLY_PAGE = 2;
const MAX_LENGTH = 1000;

interface BoxProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  placeholder: string;
  submitLabel?: string;
  autoFocus?: boolean;
}

function CommentBox({ value, onChange, onSubmit, onCancel, placeholder, submitLabel = "Post", autoFocus }: BoxProps) {
  return (
    <div className="mt-3">
      <textarea
        className="input min-h-[80px] resize-y"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_LENGTH))}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-ink-soft">{value.length}/{MAX_LENGTH}</span>
        <div className="flex gap-2">
          {onCancel && <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
          <button type="button" className="btn-primary btn-sm" disabled={!value.trim()} onClick={onSubmit}>{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

function CommentItem({ comment, user, canReply, onAskDelete }: {
  comment: LessonComment;
  user: User | null;
  canReply: boolean;
  onAskDelete: (c: LessonComment) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);

  if (comment.deleted) return <p className="text-sm italic text-ink-soft">This comment was deleted.</p>;

  const mine = !!user && user.id === comment.authorId;
  const canDelete = mine || user?.role === "admin";

  const sendReply = () => {
    const body = reply.trim();
    if (!user || !body) return;
    addComment({ lessonId: comment.lessonId, author: { id: user.id, name: user.name }, body, parentId: comment.id });
    setReply("");
    setReplying(false);
  };

  return (
    <div className="flex gap-3">
      <Avatar name={comment.authorName} size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-bold">{comment.authorName}</span>{" "}
          <span className="text-xs text-ink-soft">· {timeAgo(comment.createdAt)}{comment.updatedAt && " · edited"}</span>
        </p>

        {editing ? (
          <CommentBox
            value={draft}
            onChange={setDraft}
            placeholder="Edit your comment"
            submitLabel="Save"
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={() => { editComment(comment.id, draft); setEditing(false); }}
          />
        ) : (
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink">{comment.body}</p>
        )}

        {!editing && (
          <div className="mt-1.5 flex flex-wrap gap-3 text-xs font-semibold text-ink-muted">
            {canReply && user && <button type="button" className="hover:text-brand" onClick={() => setReplying((r) => !r)}>Reply</button>}
            {mine && <button type="button" className="hover:text-brand" onClick={() => { setDraft(comment.body); setEditing(true); }}>Edit</button>}
            {canDelete && <button type="button" className="hover:text-danger" onClick={() => onAskDelete(comment)}>Delete</button>}
            {user && !mine && (
              <ReportButton
                variant="link"
                targetType="comment"
                targetId={comment.id}
                targetLabel={`Comment by ${comment.authorName}: “${comment.body.slice(0, 80)}”`}
              />
            )}
          </div>
        )}

        {replying && (
          <CommentBox value={reply} onChange={setReply} placeholder="Write a reply" submitLabel="Reply" autoFocus onCancel={() => setReplying(false)} onSubmit={sendReply} />
        )}
      </div>
    </div>
  );
}

/** Replies under one comment: the first 3 show, then "Show more" reveals 3 more at a time. */
function Replies({ replies, user, onAskDelete }: {
  replies: LessonComment[];
  user: User | null;
  onAskDelete: (c: LessonComment) => void;
}) {
  const [visible, setVisible] = useState(REPLY_PAGE);
  if (replies.length === 0) return null;
  return (
    <>
      <ul className="ml-11 mt-4 space-y-4 border-l border-line pl-4">
        {replies.slice(0, visible).map((r) => (
          <li key={r.id}>
            <CommentItem comment={r} user={user} canReply={false} onAskDelete={onAskDelete} />
          </li>
        ))}
      </ul>
      {replies.length > visible && (
        <div className="ml-11 mt-3 pl-4">
          <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => setVisible((v) => v + REPLY_PAGE)}>
            Show more
          </button>
        </div>
      )}
    </>
  );
}

/** Discussion under a lesson: top-level comments, one level of replies, edit and delete by permission. */
export function LessonComments({ lessonId, user }: { lessonId: string; user: User | null }) {
  const all = useLessonComments(lessonId);
  const [visible, setVisible] = useState(PAGE);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<LessonComment | null>(null);

  const top = all.filter((c) => c.parentId === null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const repliesOf = (id: string) => all.filter((c) => c.parentId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const liveCount = all.filter((c) => !c.deleted).length;

  const post = () => {
    const body = draft.trim();
    if (!user || !body) return;
    addComment({ lessonId, author: { id: user.id, name: user.name }, body });
    setDraft("");
  };

  return (
    <section className="mt-10 rounded-2xl border border-line bg-white p-5" aria-labelledby="lesson-discussion">
      <h2 id="lesson-discussion" className="flex items-center gap-2 text-lg font-extrabold">
        <MessageSquare className="h-5 w-5 text-brand" aria-hidden /> Discussion
        <span className="text-sm font-normal text-ink-muted">· {liveCount}</span>
      </h2>

      {user ? (
        <CommentBox value={draft} onChange={setDraft} onSubmit={post} placeholder="Ask a question or share a tip" />
      ) : (
        <p className="mt-3 text-sm text-ink-muted"><Link href="/login" className="font-semibold text-brand hover:underline">Log in</Link> to join the discussion.</p>
      )}

      {top.length === 0 ? (
        <p className="mt-6 text-sm text-ink-muted">No comments yet. Be the first to ask a question.</p>
      ) : (
        <ul className="mt-6 space-y-6">
          {top.slice(0, visible).map((c) => (
            <li key={c.id}>
              <CommentItem comment={c} user={user} canReply onAskDelete={setConfirmDelete} />
              <Replies replies={repliesOf(c.id)} user={user} onAskDelete={setConfirmDelete} />
            </li>
          ))}
        </ul>
      )}

      {top.length > visible && (
        <div className="mt-6 text-center">
          <button type="button" className="btn-outline btn-sm" onClick={() => setVisible((v) => v + PAGE)}>Show more</button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        danger
        title="Delete this comment?"
        confirmLabel="Delete"
        body={<p>The text is removed for everyone. Replies to it stay visible.</p>}
        onConfirm={() => { if (confirmDelete) deleteComment(confirmDelete.id); setConfirmDelete(null); }}
      />
    </section>
  );
}
