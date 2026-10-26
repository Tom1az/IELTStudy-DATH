"use client";

import { useParams } from "next/navigation";
import { CourseEditor } from "@/components/studio/CourseEditor";

export default function ManageCoursePage() {
  const { id } = useParams<{ id: string }>();
  return <CourseEditor courseId={id} />;
}
