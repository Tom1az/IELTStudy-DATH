import type { Request, Response } from "express";
import type { Varchar } from "@prisma/orm-postgres/target/codec-types";
import { db } from "../prisma/db.ts";
import { varchar } from "../utils/db-types.ts";
import { httpError } from "../utils/http-error.ts";
import { toPublicUser } from "../utils/public-user.ts";

const Users = db.orm.public.Users;

// `authenticate` has already loaded the user from the database, so no query is needed here
const getMe = async (req: Request, res: Response) => {
  return res.status(200).json({
    user: req.user!,
    message: "Your profile",
  });
};

const updateMe = async (req: Request, res: Response) => {
  // Only the fields from profileUpdateSchema reach here; targetBand may be null to clear it
  const { fullName, targetBand }: { fullName?: string; targetBand?: number | null } =
    req.value!.body;

  const changes: { fullName?: Varchar<255>; targetBand?: number | null } = {};
  if (fullName !== undefined) changes.fullName = varchar<255>(fullName);
  if (targetBand !== undefined) changes.targetBand = targetBand;

  const user = await Users.where({ userId: req.user!.userId }).update(changes);
  if (!user) {
    // The user was deleted between `authenticate` and this update
    throw httpError(404, "User not found");
  }

  return res.status(200).json({
    user: toPublicUser(user),
    message: "Profile updated",
  });
};

export default {
  getMe,
  updateMe,
};
