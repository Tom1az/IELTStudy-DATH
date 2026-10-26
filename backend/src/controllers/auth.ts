import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { db } from "../prisma/db.ts";
import { isUniqueViolation } from "../utils/db-errors.ts";
import { varchar } from "../utils/db-types.ts";
import { httpError } from "../utils/http-error.ts";
import { signToken } from "../utils/jwt.ts";
import { toPublicUser } from "../utils/public-user.ts";

const saltRounds = 10;

const Users = db.orm.public.Users;

// A bcrypt hash (same cost as saltRounds) of a random string nobody knows. Login compares
// against it when the email is unknown, so an unknown email takes about as long as a wrong
// password and response times don't reveal which emails have accounts.
const DUMMY_HASH = "$2b$10$C6qsLH1Aax4M2kHvnWqZxuiGjvcM0lC3nl2RxFB5iHPlZvmGEpw1q";

const DUPLICATE_EMAIL = "An account with this email already exists";

const register = async (req: Request, res: Response) => {
  const { email, fullName, password } = req.value!.body;

  const existingUser = await Users.first({ email });
  if (existingUser) {
    throw httpError(409, DUPLICATE_EMAIL);
  }

  const hashedPass = await bcrypt.hash(password, saltRounds);

  // The role isn't set here, so the database default (learner) applies
  let user;
  try {
    user = await Users.create({
      email: varchar<255>(email),
      fullName: varchar<255>(fullName),
      hashedPass: varchar<255>(hashedPass),
    });
  } catch (err) {
    // Two sign-ups with the same email at the same moment: both pass the check above,
    // and the UNIQUE constraint on email rejects the second insert
    if (isUniqueViolation(err)) throw httpError(409, DUPLICATE_EMAIL);
    throw err;
  }

  return res.status(201).json({
    user: toPublicUser(user),
    token: signToken(user.userId),
    message: "Account created",
  });
};

const login = async (req: Request, res: Response) => {
  const { email, password } = req.value!.body;

  const user = await Users.first({ email });
  const passwordMatches = await bcrypt.compare(password, user ? user.hashedPass : DUMMY_HASH);

  // Same answer for an unknown email and a wrong password
  if (!user || !passwordMatches) {
    throw httpError(401, "Invalid email or password");
  }
  // Checked only after the password, so this doesn't reveal that the email exists
  if (!user.isActive) {
    throw httpError(403, "This account is deactivated");
  }

  return res.status(200).json({
    user: toPublicUser(user),
    token: signToken(user.userId),
    message: "Logged in",
  });
};

export default {
  register,
  login,
};
