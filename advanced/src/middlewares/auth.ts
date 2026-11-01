import type { NextFunction, Request, Response } from "express";
import { db } from "../prisma/db.ts";
import { httpError } from "../utils/http-error.ts";
import { verifyToken } from "../utils/jwt.ts";
import { toPublicUser } from "../utils/public-user.ts";
import type { UserRole } from "../utils/public-user.ts";

const Users = db.orm.public.Users;

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw httpError(401, "Please log in");
  }
  const userId = verifyToken(header.slice("Bearer ".length));
  if (userId === null) {
    throw httpError(401, "Please log in");
  }
  const user = await Users.first({ userId });
  if (!user) {
    throw httpError(401, "Please log in");
  }
  if (!user.isActive) {
    throw httpError(401, "This account is deactivated");
  }
  req.user = toPublicUser(user);
  next();
};

export const authorize = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw httpError(401, "Please log in");
    }
    if (!roles.includes(req.user.role)) {
      throw httpError(403, "You don't have permission to do this");
    }
    next();
  };
};
