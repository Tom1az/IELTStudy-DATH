"use client";

import { useState } from "react";
import { Flag, MessageSquare } from "lucide-react";
import { lessonApi } from "@/lib/api";
import type { DiscussionPost } from "@/lib/types";
import { useAsync } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";
import { Avatar, EmptyState, Spinner, StatusPill, useToast } from "@/components/ui";
import { ReportDialog } from "@/components/ReportDialog";
import { timeAgo } from "@/lib/format";

export function Discussion({ lessonId, canPost, onCount }: { lessonId: string; canPost: boolean; onCount?: (n: number) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { data, reload, loading } = useAsync(async () => {
    const posts = await lessonApi.posts(lessonId);
    onCount?.(posts.length);
    return posts;
  }, [lessonId]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState(false);
  const [reporting, setReporting] = useState<DiscussionPost | null>(null);

  const submit = async (text: string, parentId?: string) => {
    setPending(true);
    try {
      await lessonApi.addPost(lessonId, text, parentId);
      if (parentId) { setReply(""); setReplyTo(null); } else setBody("");
      await reload(true);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  const roots = (data ?? []).filter((p) => !p.parentId);
  const replies = (id: string) => (data ?? []).filter((p) => p.parentId === id);

  const PostView = ({ p, isReply }: { p: DiscussionPost; isReply?: boolean }) => (
    <div className={isReply ? "ml-11 mt-3 border-l-2 border-line pl-4" : ""}>
      <div className="flex items-start gap-3">
        <Avatar name={p.authorName} size={32} className={p.authorRole === "instructor" ? "bg-brand" : ""} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{p.authorName}</span>
            {p.authorRole === "instructor" && <StatusPill tone="orange">Instructor</StatusPill>}
            {p.hidden && <StatusPill tone="red">Hidden by moderator</StatusPill>}
            <span className="text-xs text-ink-soft">{timeAgo(p.createdAt)}</span>
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{p.body}</p>
          <div className="mt-1.5 flex gap-4 text-xs font-semibold text-ink-muted">
            {canPost && !isReply && <button className="hover:text-brand" onClick={() => setReplyTo(replyTo === p.id ? null : p.id)}>Reply</button>}
            {user && user.id !== p.userId && <button className="flex items-center gap-1 hover:text-danger" onClick={() => setReporting(p)}><Flag className="h-3 w-3" /> Report</button>}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {canPost ? (
        <form className="mb-6" onSubmit={(e) => { e.preventDefault(); submit(body); }}>
          <label htmlFor="new-post" className="sr-only">Ask a question or share a tip</label>
          <textarea id="new-post" value={body} onChange={(e) => setBody(e.target.value)} className="input min-h-[84px]" placeholder="Ask a question or share a tip about this lesson…" maxLength={2000} />
          <div className="mt-2 flex justify-end"><button className="btn-dark btn-sm" disabled={pending || body.trim().length < 2}>{pending && <Spinner className="h-3.5 w-3.5" />}Post</button></div>
        </form>
      ) : (
        <p className="mb-6 rounded-xl bg-sand/60 px-4 py-3 text-sm text-ink-muted">Enroll in this course to join the discussion.</p>
      )}
      {loading && !data ? <Spinner className="text-navy" /> : roots.length === 0 ? (
        <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="No posts yet">Be the first to ask a question about this lesson.</EmptyState>
      ) : (
        <ul className="space-y-5">
          {roots.map((p) => (
            <li key={p.id} className="rounded-xl border border-line bg-white p-4">
              <PostView p={p} />
              {replies(p.id).map((r) => <PostView key={r.id} p={r} isReply />)}
              {replyTo === p.id && (
                <form className="ml-11 mt-3" onSubmit={(e) => { e.preventDefault(); submit(reply, p.id); }}>
                  <label htmlFor={`reply-${p.id}`} className="sr-only">Reply</label>
                  <textarea id={`reply-${p.id}`} autoFocus value={reply} onChange={(e) => setReply(e.target.value)} className="input min-h-[64px]" placeholder={`Reply to ${p.authorName}…`} />
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setReplyTo(null)}>Cancel</button>
                    <button className="btn-dark btn-sm" disabled={pending || reply.trim().length < 2}>Reply</button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <ReportDialog open={!!reporting} onClose={() => setReporting(null)} targetType="post" targetId={reporting?.id ?? ""} targetPreview={reporting?.body ?? ""} />
    </div>
  );
}
