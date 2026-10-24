import type { User } from "@/lib/types";
import { ApiError, request, setToken } from "./client";
import { audit, commit, currentUser, db, hashPassword, isEmail, issueToken, nowIso, passwordProblem, publicUser, requireUser, uid, validate, verifyPassword } from "./mock-db";

export interface AuthResult {
  token: string;
  user: User;
}

export const authApi = {
  async login(email: string, password: string): Promise<AuthResult> {
    const res = await request<AuthResult>("POST", "/auth/login", { email, password }, () => {
      validate({ email: !isEmail(email) && "Enter a valid email address.", password: !password && "Enter your password." });
      const u = db().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!u || !verifyPassword(password, u.passwordHash)) throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
      if (u.status === "suspended") throw new ApiError(403, "ACCOUNT_SUSPENDED", "This account has been suspended. Contact support.");
      u.lastActiveAt = nowIso();
      commit();
      return { token: issueToken(u), user: publicUser(u) };
    });
    setToken(res.token);
    return res;
  },

  async register(input: { name: string; email: string; password: string; targetBand: number; role?: "learner" }): Promise<AuthResult> {
    const res = await request<AuthResult>("POST", "/auth/register", input, () => {
      const email = input.email.trim().toLowerCase();
      validate({
        name: input.name.trim().length < 2 && "Enter your full name.",
        email: !isEmail(email) ? "Enter a valid email address." : db().users.some((u) => u.email.toLowerCase() === email) && "An account with this email already exists.",
        password: passwordProblem(input.password),
        targetBand: (input.targetBand < 4 || input.targetBand > 9) && "Choose a band between 4.0 and 9.0.",
      });
      const u = {
        id: uid("u"), email, name: input.name.trim(), role: "learner" as const, status: "active" as const, targetBand: input.targetBand,
        createdAt: nowIso(), lastActiveAt: nowIso(), placementDone: false, passwordHash: hashPassword(input.password),
        notificationPrefs: { newContent: true, deadlines: true, results: true, email: false },
      };
      db().users.push(u);
      db().notifications.unshift({ id: uid("n"), userId: u.id, type: "system", title: "Welcome to IELTStudy", body: "Take the 15-minute placement quiz so we can recommend a level and build your learning path.", link: "/placement", read: false, createdAt: nowIso() });
      commit();
      return { token: issueToken(u), user: publicUser(u) };
    });
    setToken(res.token);
    return res;
  },

  async me(): Promise<User | null> {
    try {
      return await request<User | null>("GET", "/auth/me", undefined, () => {
        const u = currentUser();
        return u ? publicUser(u) : null;
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  },

  logout() {
    setToken(null);
  },

  /** Mock: returns the reset link that the backend would email, so it can be shown in the demo. */
  forgotPassword(email: string) {
    return request<{ sent: true; demoResetLink?: string }>("POST", "/auth/forgot-password", { email }, () => {
      validate({ email: !isEmail(email) && "Enter a valid email address." });
      const u = db().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!u) return { sent: true as const }; // never reveal whether an account exists
      const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      db().resetTokens.push({ email: u.email, token, expiresAt: new Date(Date.now() + 30 * 60000).toISOString() });
      commit();
      return { sent: true as const, demoResetLink: `/reset-password?token=${token}` };
    });
  },

  resetPassword(token: string, password: string) {
    return request<{ ok: true }>("POST", "/auth/reset-password", { token, password }, () => {
      const t = db().resetTokens.find((x) => x.token === token);
      if (!t || Date.parse(t.expiresAt) < Date.now()) throw new ApiError(400, "INVALID_TOKEN", "This reset link is invalid or has expired. Request a new one.");
      validate({ password: passwordProblem(password) });
      const u = db().users.find((x) => x.email === t.email)!;
      u.passwordHash = hashPassword(password);
      db().resetTokens = db().resetTokens.filter((x) => x.token !== token);
      commit();
      return { ok: true as const };
    });
  },

  changePassword(current: string, next: string) {
    return request<{ ok: true }>("POST", "/auth/change-password", { current, next }, () => {
      const u = requireUser();
      if (!verifyPassword(current, u.passwordHash)) throw new ApiError(422, "VALIDATION_ERROR", "Please check the highlighted fields.", { current: "Current password is incorrect." });
      validate({ next: passwordProblem(next) });
      u.passwordHash = hashPassword(next);
      commit();
      return { ok: true as const };
    });
  },

  updateProfile(patch: Partial<Pick<User, "name" | "targetBand" | "bio" | "notificationPrefs">>) {
    return request<User>("PATCH", "/users/me", patch, () => {
      const u = requireUser();
      validate({
        name: patch.name !== undefined && patch.name.trim().length < 2 && "Enter your full name.",
        targetBand: patch.targetBand !== undefined && (patch.targetBand < 4 || patch.targetBand > 9) && "Choose a band between 4.0 and 9.0.",
      });
      if (patch.name !== undefined) u.name = patch.name.trim();
      if (patch.targetBand !== undefined) u.targetBand = patch.targetBand;
      if (patch.bio !== undefined) u.bio = patch.bio;
      if (patch.notificationPrefs) u.notificationPrefs = { ...u.notificationPrefs, ...patch.notificationPrefs };
      if (u.role === "admin") audit(u, "user.update_self", u.email);
      commit();
      return publicUser(u);
    });
  },
};
