import type { User } from "@/lib/types";
import type { BackendAuthResponse, BackendUser } from "./backend-types";
import { ApiError, backendRequest, setToken } from "./client";
import { toUser } from "./mappers";

export interface AuthResult {
  token: string;
  user: User;
}

/**
 * The backend does not store "placement done" on the user. A learner has done it when
 * `GET /diagnostic` reports a completed attempt. Staff never take the placement quiz.
 */
async function isPlacementDone(user: BackendUser): Promise<boolean> {
  if (user.role !== "learner") return true;
  try {
    const res = await backendRequest<{ completedAttemptId: number | null }>("GET", "/diagnostic");
    return res.completedAttemptId !== null;
  } catch {
    // No diagnostic quiz seeded yet, or the call failed: treat placement as not done
    return false;
  }
}

async function toAuthResult(res: BackendAuthResponse): Promise<AuthResult> {
  setToken(res.token);
  return { token: res.token, user: toUser(res.user, await isPlacementDone(res.user)) };
}

/** The form's field is called `name`, the backend's is `fullName`. */
function renameFullNameError(e: unknown) {
  if (e instanceof ApiError && e.fields?.fullName) e.fields.name = e.fields.fullName;
}

export const authApi = {
  async login(email: string, password: string): Promise<AuthResult> {
    return toAuthResult(await backendRequest<BackendAuthResponse>("POST", "/auth/login", { email, password }));
  },

  async register(input: { name: string; email: string; password: string; targetBand: number }): Promise<AuthResult> {
    let res: BackendAuthResponse;
    try {
      // The backend only accepts these three fields at sign-up and always creates a learner
      res = await backendRequest<BackendAuthResponse>("POST", "/auth/register", {
        email: input.email,
        fullName: input.name,
        password: input.password,
      });
    } catch (e) {
      renameFullNameError(e);
      throw e;
    }
    const result = await toAuthResult(res);
    // The target band is set right after sign-up, through PATCH /me
    const patched = await backendRequest<{ user: BackendUser }>("PATCH", "/me", { targetBand: input.targetBand });
    return { token: result.token, user: toUser(patched.user, result.user.placementDone) };
  },

  /** The logged-in user, or null when there is no valid token. */
  async me(): Promise<User | null> {
    try {
      const res = await backendRequest<{ user: BackendUser }>("GET", "/me");
      return toUser(res.user, await isPlacementDone(res.user));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  },

  logout() {
    setToken(null);
  },

  /** The backend profile has a name and a target band. */
  async updateProfile(patch: { name?: string; targetBand?: number }): Promise<User> {
    const body: { fullName?: string; targetBand?: number } = {};
    if (patch.name !== undefined) body.fullName = patch.name;
    if (patch.targetBand !== undefined) body.targetBand = patch.targetBand;
    try {
      const res = await backendRequest<{ user: BackendUser }>("PATCH", "/me", body);
      return toUser(res.user, await isPlacementDone(res.user));
    } catch (e) {
      renameFullNameError(e);
      throw e;
    }
  },
};
