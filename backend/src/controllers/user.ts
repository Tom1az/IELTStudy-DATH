import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { db } from "../prisma/db.ts";
import { varchar } from "../utils/db-types.ts";

const saltRounds = 10;

const Users = db.orm.public.Users;

// Never send the password hash back to the client
type UserRow = { userId: number; email: string; fullName: string; createdAt: unknown };
const toPublicUser = ({ userId, email, fullName, createdAt }: UserRow) => ({
  userId,
  email,
  fullName,
  createdAt,
});

const index = async (req: Request, res: Response) => {
  const users = await Users.all();

  return res.status(200).json({
    users: users.map(toPublicUser),
    message: "You requested the list of users",
  });
};

const getUser = async (req: Request, res: Response) => {
  const { userID } = req.value!.params!;

  const user = await Users.first({ userId: userID });

  if (!user) {
    return res.status(404).json({
      user: null,
      message: "User not found",
    });
  }

  return res.status(200).json({
    user: toPublicUser(user),
    message: "Found a user",
  });
};

const newUser = async (req: Request, res: Response) => {
  const { email, fullName, password } = req.value!.body;

  const hashedPass = await bcrypt.hash(password, saltRounds);
  const user = await Users.create({
    email: varchar<255>(email),
    fullName: varchar<255>(fullName),
    hashedPass: varchar<255>(hashedPass),
  });

  return res.status(201).json({
    user: toPublicUser(user),
    message: "You created a new user",
  });
};

const replaceUser = async (req: Request, res: Response) => {
  const { userID } = req.value!.params!;
  const { email, fullName, password } = req.value!.body;

  const hashedPass = await bcrypt.hash(password, saltRounds);
  await Users.where({ userId: userID }).update({
    email: varchar<255>(email),
    fullName: varchar<255>(fullName),
    hashedPass: varchar<255>(hashedPass),
  });

  return res.status(200).json({
    message: "You replaced a user",
  });
};

const updateUser = async (req: Request, res: Response) => {
  const { userID } = req.value!.params!;
  // Only whitelisted fields from userUpdateSchema reach here
  const { email, fullName }: { email?: string; fullName?: string } = req.value!.body;

  await Users.where({ userId: userID }).update({
    ...(email !== undefined && { email: varchar<255>(email) }),
    ...(fullName !== undefined && { fullName: varchar<255>(fullName) }),
  });

  return res.status(200).json({
    message: "Successfully updated",
  });
};

export default {
  index,
  newUser,
  getUser,
  replaceUser,
  updateUser,
};
