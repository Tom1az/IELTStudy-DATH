import type { Request, Response } from "express";
import { db } from "../prisma/db.ts";
import { getUsageStats } from "../services/stats.ts";
import { httpError } from "../utils/http-error.ts";
import { toPublicUser } from "../utils/public-user.ts";
import type { UserRole } from "../utils/public-user.ts";

const Users = db.orm.public.Users;

// Every user, oldest account first, optionally filtered by role and/or active status
const listUsers = async (req: Request, res: Response) => {
  const { role, isActive }: { role?: UserRole; isActive?: boolean } = req.value!.query;

  // Only the filters that were given go into the WHERE clause
  const filter: { role?: UserRole; isActive?: boolean } = {};
  if (role !== undefined) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive;

  const rows = await Users.where(filter)
    .orderBy((u) => u.userId.asc())
    .all();

  return res.status(200).json({
    users: rows.map(toPublicUser),
    message: "Users",
  });
};

// Changes a user's role and/or deactivates them. `authenticate` reloads the user on every
// request, so the change applies to their very next request, even with an old token.
const updateUserAccess = async (req: Request, res: Response) => {
  const userId: number = req.value!.params!.userId;
  const { role, isActive }: { role?: UserRole; isActive?: boolean } = req.value!.body;

  // Admins can't change their own account here. Only an admin can demote an admin, so this
  // also means the platform can't lose its last admin.
  if (userId === req.user!.userId) {
    throw httpError(409, "You can't change your own role or account status");
  }

  const changes: { role?: UserRole; isActive?: boolean } = {};
  if (role !== undefined) changes.role = role;
  if (isActive !== undefined) changes.isActive = isActive;

  const user = await Users.where({ userId }).update(changes);
  if (!user) {
    throw httpError(404, "User not found");
  }

  return res.status(200).json({
    user: toPublicUser(user),
    message: "User updated",
  });
};

const getStats = async (req: Request, res: Response) => {
  return res.status(200).json({
    stats: await getUsageStats(),
    message: "Usage statistics",
  });
};

export default {
  listUsers,
  updateUserAccess,
  getStats,
};
