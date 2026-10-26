import type { ApiErrorShape } from "@/lib/types";
import type { BackendErrorBody } from "./backend-types";

/**
 * Single entry point for every API call to the Express backend.
 *
 * By default requests go to `/api/v1`, which `next.config.mjs` proxies to the backend
 * (`BACKEND_URL`), so the backend needs no CORS. Set `NEXT_PUBLIC_API_URL` to call
 * another address directly.
 */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "/api/v1").replace(/\/$/, "");
const TOKEN_KEY = "ieltstudy.token";

export class ApiError extends Error implements ApiErrorShape {
  status: number;
  code: string;
  fields?: Record<string, string>;
  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const getToken = () => {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t: string | null) => {
  try {
    if (t) window.localStorage.setItem(TOKEN_KEY, t);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable */ }
};

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Turns Joi's `details` (e.g. `"email" must be a valid email`) into `{ email: "..." }`,
 * so forms can show each message under its own field. A detail without a quoted
 * field name at the start is skipped (the page then shows the top-level message).
 */
export function fieldsFromDetails(details: string[] | undefined): Record<string, string> | undefined {
  if (!details || details.length === 0) return undefined;
  const fields: Record<string, string> = {};
  for (const detail of details) {
    const match = /^"([^"]+)"/.exec(detail);
    if (match && !fields[match[1]]) fields[match[1]] = detail;
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

/**
 * Calls the backend and returns the parsed JSON body as-is (including the backend's
 * `message`). Each API module picks the resource it needs from the body.
 */
export async function backendRequest<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined || method === "GET" ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const e = (data as BackendErrorBody | null)?.error ?? {};
    // The backend has no refresh token: a 401 on a logged-in call means the token expired
    // (it lasts 1 day) or the account was deactivated. Drop the token and log in again.
    // Auth calls are skipped: a 401 there is just a wrong password.
    if (res.status === 401 && token && !path.startsWith("/auth/")) {
      setToken(null);
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      }
    }
    throw new ApiError(res.status, `HTTP_${res.status}`, e.message ?? res.statusText, fieldsFromDetails(e.details));
  }
  return data as T;
}

/**
 * For features the frontend has a page for but the backend does not build yet
 * (see docs/plans/phase-4-frontend.md). These reject with a clear message instead
 * of calling a route that does not exist.
 */
export function notAvailable(feature: string): Promise<never> {
  return Promise.reject(new ApiError(501, "NOT_AVAILABLE", `${feature} is not available yet.`));
}
