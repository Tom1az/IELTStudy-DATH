import type { Request, Response } from "express";
import { createUploadTicket } from "../services/storage.ts";

// Step 1 of an upload: hand out a signed URL. The client then PUTs the file straight to Supabase
// Storage (it never passes through this API) and sends `path` as a passage's `mediaPath`.
// `contentType` is only validated here: the client sends it again as the PUT's Content-Type.
const createUpload = async (req: Request, res: Response) => {
  const { fileName }: { fileName: string; contentType: string } = req.value!.body;

  const upload = await createUploadTicket(req.user!.userId, fileName);

  return res.status(201).json({
    upload,
    message: "Upload URL created",
  });
};

export default {
  createUpload,
};
