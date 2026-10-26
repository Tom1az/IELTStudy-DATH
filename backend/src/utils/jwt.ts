import jwt from "jsonwebtoken";

// Tokens follow the API contract: HS256, `sub` = the user's id, valid for 1 day, no refresh token
const ALGORITHM = "HS256";
const EXPIRES_IN = "1d";

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set. Add it to backend/.env (see .env.example).");
  }
  return secret;
};

export const signToken = (userId: number) => {
  return jwt.sign({}, getSecret(), {
    subject: String(userId),
    algorithm: ALGORITHM,
    expiresIn: EXPIRES_IN,
  });
};

// Returns the user id inside a valid token, or null if the token is bad, expired or signed
// with another secret. Pinning the algorithm stops a token from choosing its own (e.g. "none").
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
