import type { Request, Response } from "express";
import { createComment, listComments, removeComment, updateComment } from "../services/comments.ts";
import { createReport, handleReport, listReports } from "../services/reports.ts";
import type { ReportStatus, ReportTargetType } from "../services/reports.ts";
import type { PageQuery } from "../utils/pagination.ts";

const listLessonComments = async (req: Request, res: Response) => {
  const paging: PageQuery = req.value!.query;
  return res.status(200).json({
    ...(await listComments(req.value!.params!.lessonId, req.user!, paging)),
    message: "Comments",
  });
};

const postLessonComment = async (req: Request, res: Response) => {
  const { body, parentId }: { body: string; parentId?: number | null } = req.value!.body;
  return res.status(201).json({
    comment: await createComment(req.value!.params!.lessonId, req.user!, { body, parentId }),
    message: "Comment posted",
  });
};

const patchComment = async (req: Request, res: Response) => {
  const { body }: { body: string } = req.value!.body;
  return res.status(200).json({
    comment: await updateComment(req.value!.params!.commentId, req.user!, body),
    message: "Comment updated",
  });
};

const deleteComment = async (req: Request, res: Response) => {
  await removeComment(req.value!.params!.commentId, req.user!);
  return res.status(200).json({ message: "Comment removed" });
};

const postReport = async (req: Request, res: Response) => {
  const input: { targetType: ReportTargetType; targetId: number; reason: string } = req.value!.body;
  return res.status(201).json({
    report: await createReport(req.user!, input),
    message: "Thanks, an admin will review this",
  });
};

const getReports = async (req: Request, res: Response) => {
  const query: { status?: ReportStatus; targetType?: ReportTargetType } & PageQuery = req.value!.query;
  return res.status(200).json({ ...(await listReports(query)), message: "Reports" });
};

const patchReport = async (req: Request, res: Response) => {
  const input: { status: "resolved" | "dismissed"; note?: string; removeComment?: boolean } =
    req.value!.body;
  return res.status(200).json({
    report: await handleReport(req.user!, req.value!.params!.reportId, input),
    message: input.status === "resolved" ? "Report resolved" : "Report dismissed",
  });
};

export default {
  listLessonComments,
  postLessonComment,
  patchComment,
  deleteComment,
  postReport,
  getReports,
  patchReport,
};
