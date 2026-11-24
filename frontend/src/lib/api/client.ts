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

/**
 * True when a call failed because the endpoint isn't there yet (or the service behind it
 * is down), rather than because of something the user did. A page can then show its
 * "not available yet" card instead of an error, and start working on its own the day the
 * route ships. A 400/401/403/409 is a real answer and is never swallowed here.
 */
export function isMissingEndpoint(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === 404 || e.status === 501 || e.status >= 502;
  // `fetch` rejects with a TypeError when it can't reach the server at all
  return e instanceof TypeError;
}

/** Runs a call that may hit an endpoint the backend hasn't built yet; `null` means "not there". */
export async function optional<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (e) {
    if (isMissingEndpoint(e)) return null;
    throw e;
  }
}

/** The `PageMeta` the backend puts next to every paged list. */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Reads every page of a paged list endpoint (the backend allows at most 100 rows a page).
 * For screens that need the whole list, e.g. to compute best scores over all my attempts.
 */
export async function fetchAllPages<T>(path: string, key: string): Promise<T[]> {
  const rows: T[] = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let page = 1; ; page++) {
    const res = await backendRequest<PageMeta & Record<string, unknown>>("GET", `${path}${sep}page=${page}&pageSize=100`);
    rows.push(...((res[key] as T[]) ?? []));
    if (page >= res.totalPages) return rows;
  }
}
