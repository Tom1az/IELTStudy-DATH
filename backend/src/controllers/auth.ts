import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "../prisma/db.ts";
import { isUniqueViolation } from "../utils/db-errors.ts";
import { varchar } from "../utils/db-types.ts";
import { httpError } from "../utils/http-error.ts";
import { signToken } from "../utils/jwt.ts";
import { toPublicUser } from "../utils/public-user.ts";
import { appUrl, sendMail } from "../services/mail.ts";

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

// ----- Password reset -----

const RESET_TOKEN_MINUTES = 30;
const RESET_SENT = "If an account exists for that email, a reset link has been sent";
const RESET_INVALID = "This reset link is invalid or has expired. Ask for a new one";

// Only this hash is stored, so a leaked database can't be used to reset passwords
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Always the same 200, so the endpoint can't tell anyone which emails have accounts
const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.value!.body;
  const user = await Users.first({ email });

  if (user && user.isActive) {
    const token = randomBytes(32).toString("base64url");
    const now = Temporal.Now.instant();

    await db.transaction(async (tx) => {
      const orm = tx.orm.public;
      // Asking again cancels the links sent before
      await orm.PasswordResetTokens.where((t) =>
        and(t.userId.eq(user.userId), t.usedAt.isNull()),
      ).updateAndCount({ usedAt: now });
      await orm.PasswordResetTokens.create({
        userId: user.userId,
        tokenHash: varchar<64>(hashToken(token)),
        expiresAt: now.add({ minutes: RESET_TOKEN_MINUTES }),
        usedAt: null,
      });
    });

    const link = `${appUrl()}/reset-password?token=${token}`;
    // Not awaited: a slow mail provider must not make known emails answer slower than unknown ones
    void sendMail({
      to: user.email,
      subject: "Reset your IELTStudy password",
      text:
        `Hi ${user.fullName},\n\nSomeone (hopefully you) asked to reset your IELTStudy password. ` +
        `Open this link within ${RESET_TOKEN_MINUTES} minutes to choose a new one:\n\n${link}\n\n` +
        "If you didn't ask for this, you can ignore this email: your password stays the same.",
    }).catch((err: unknown) => {
      console.error("Could not send the password reset email:", err);
    });
  }

  return res.status(200).json({ message: RESET_SENT });
};

const resetPassword = async (req: Request, res: Response) => {
  const { token, password }: { token: string; password: string } = req.value!.body;

  const row = await db.orm.public.PasswordResetTokens.first({
    tokenHash: varchar<64>(hashToken(token)),
  });
  const now = Temporal.Now.instant();
  if (!row || row.usedAt !== null || Temporal.Instant.compare(row.expiresAt, now) <= 0) {
    throw httpError(400, RESET_INVALID);
  }
  const user = await Users.first({ userId: row.userId });
  if (!user || !user.isActive) {
    throw httpError(400, RESET_INVALID);
  }

  const hashedPass = await bcrypt.hash(password, saltRounds);

  await db.transaction(async (tx) => {
    const orm = tx.orm.public;
    // One UPDATE ... WHERE used_at IS NULL, so two requests with the same token can't both win
    const claimed = await orm.PasswordResetTokens.where((t) =>
      and(t.tokenId.eq(row.tokenId), t.usedAt.isNull()),
    ).updateAndCount({ usedAt: now });
    if (claimed === 0) {
      throw httpError(400, RESET_INVALID);
    }
    // Any other link still out there stops working too
    await orm.PasswordResetTokens.where((t) =>
      and(t.userId.eq(user.userId), t.usedAt.isNull()),
    ).updateAndCount({ usedAt: now });
    await orm.Users.where({ userId: user.userId }).update({
      hashedPass: varchar<255>(hashedPass),
      passwordChangedAt: now,
    });
  });

  return res.status(200).json({ message: "Your password has been changed. Log in with the new one" });
};

export default {
  register,
  login,
  forgotPassword,
  resetPassword,
};
