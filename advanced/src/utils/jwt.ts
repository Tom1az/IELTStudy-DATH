import jwt from "jsonwebtoken";

const ALGORITHM = "HS256";

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set. Add it to .env.");
  }
  return secret;
};

export const verifyToken = (token: string) => {
  let payload;
  try {
    payload = jwt.verify(token, getSecret(), { algorithms: [ALGORITHM] });
  } catch {
    return null;
  }
  if (typeof payload === "string") return null;
  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId < 1) return null;
  return userId;
};
