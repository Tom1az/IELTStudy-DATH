import type { ApiErrorShape } from "@/lib/types";

/**
 * Single entry point for every API call.
 *
 * - When NEXT_PUBLIC_API_URL is set, requests go to the Express REST backend
 *   (`${API_URL}${path}`) with the JWT in the Authorization header.
 * - Otherwise the call is served by the in-browser mock handler, which applies
 *   the same validation and role rules and persists to localStorage. This lets
 *   the frontend be built, demoed and tested before the backend is deployed.
 */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const USING_MOCK = !API_URL;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function request<T>(method: Method, path: string, body: unknown, mock: () => T | Promise<T>): Promise<T> {
  if (!USING_MOCK) {
    const token = getToken();
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined || method === "GET" ? undefined : JSON.stringify(body),
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const e = (data?.error ?? data ?? {}) as Partial<ApiErrorShape>;
      throw new ApiError(res.status, e.code ?? "HTTP_ERROR", e.message ?? res.statusText, e.fields);
    }
    return data as T;
  }
  // mock: small network-like delay, deep copy so callers can't mutate the store
  await sleep(method === "GET" ? 90 : 160);
  const out = await mock();
  return out === undefined ? (undefined as T) : (JSON.parse(JSON.stringify(out)) as T);
}

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return p.length ? "?" + p.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&") : "";
};
