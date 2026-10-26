"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import { ApiError, instructorApi } from "@/lib/api";
import type { BackendPassage } from "@/lib/api/backend-types";
import { Modal, Select, Spinner, TextArea, TextInput, useToast } from "@/components/ui";

// The file types `POST /uploads` accepts for audio and video
const ACCEPT = { listening_audio: "audio/mpeg,audio/mp4,audio/wav", video: "video/mp4,video/webm" };

/**
 * Real backend: add or edit a reading text, a recording or a video in a lesson.
 * Reading text needs `content`; audio and video need an uploaded file, and their
 * `content` is an optional transcript.
 */
export function PassageForm({ lessonId, passage, onClose, onSaved }: { lessonId: number; passage: BackendPassage | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<BackendPassage["type"]>(passage?.type ?? "reading_text");
  const [title, setTitle] = useState(passage?.title ?? "");
  const [content, setContent] = useState(passage?.content ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const isMedia = type !== "reading_text";

  const save = async () => {
    setPending(true);
    setErrs({});
    try {
      // Keep the current file unless a new one was picked
      let mediaPath = isMedia ? passage?.mediaPath ?? null : null;
      if (isMedia && file) mediaPath = await instructorApi.uploadMedia(file);
      const body = { type, title: title.trim() || null, content: content.trim() || null, mediaPath };
      if (passage) await instructorApi.updatePassage(passage.passageId, body);
      else await instructorApi.createPassage({ lessonId, ...body });
      toast(passage ? "Passage saved." : "Passage added.");
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrs(e.fields);
      toast((e as Error).message, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={passage ? "Edit passage" : "Add a passage"} wide footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={pending}>{pending && <Spinner className="h-4 w-4" />}Save</button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Type" value={type} onChange={(e) => setType(e.target.value as BackendPassage["type"])}>
            <option value="reading_text">Reading text</option>
            <option value="listening_audio">Listening audio</option>
            <option value="video">Video</option>
          </Select>
          <TextInput label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={errs.title} />
        </div>
        {isMedia && (
          <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-[#C9BFA9] p-5 text-center text-sm text-ink-muted">
            <FileUp className="h-6 w-6" />
            <strong className="text-ink">{file ? file.name : passage?.mediaPath ? "Replace the file" : "Choose a file to upload"}</strong>
            <span className="text-xs">{type === "video" ? "MP4 or WebM" : "MP3, M4A or WAV"}. The file goes straight to storage when you save.</span>
            <input type="file" className="sr-only" accept={ACCEPT[type]} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
        <TextArea label={isMedia ? "Transcript (optional)" : "Text"} value={content} onChange={(e) => setContent(e.target.value)} error={errs.content} className="min-h-[200px]"
          hint={isMedia ? "Learners can show it in practice mode. Without an uploaded file the quiz player reads it aloud." : "Leave a blank line between paragraphs."} />
      </div>
    </Modal>
  );
}
