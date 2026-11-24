import type { Request, Response } from "express";
import { listNotifications, markAllRead, markRead } from "../services/notifications.ts";
import type { PageQuery } from "../utils/pagination.ts";

const listMine = async (req: Request, res: Response) => {
  const { unread, ...paging }: { unread?: boolean } & PageQuery = req.value!.query;
  return res.status(200).json({
    ...(await listNotifications(req.user!.userId, { unread, ...paging })),
    message: "Your notifications",
  });
};

const markOneRead = async (req: Request, res: Response) => {
  return res.status(200).json({
    notification: await markRead(req.user!.userId, req.value!.params!.notificationId),
    message: "Marked as read",
  });
};

const markEveryRead = async (req: Request, res: Response) => {
  return res.status(200).json({
    updated: await markAllRead(req.user!.userId),
    message: "All notifications marked as read",
  });
};

export default { listMine, markOneRead, markEveryRead };
