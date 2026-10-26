"use client";

import { useParams } from "next/navigation";
import { LessonEditor } from "@/components/studio/LessonEditor";

export default function LessonEditorPage() {
  const { id } = useParams<{ id: string }>();
  return <LessonEditor lessonId={id} />;
}
