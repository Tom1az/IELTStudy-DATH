import { buildSeed, DB_VERSION, type Db } from "@/data/seed";
import type { Role, UserRecord, AuditLog, AppNotification } from "@/lib/types";
import { ApiError, getToken } from "./client";
import { sha256 } from "@/lib/sha256";

const KEY = "ieltstudy.db";
let cache: Db | null = null;

export function db(): Db {
  if (cache) return cache;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Db;
        if (parsed.version === DB_VERSION) {
          cache = parsed;
          return cache;
        }
      }
    } catch { /* corrupted or unavailable → reseed */ }
  }
  cache = buildSeed();
  commit();
  return cache;
}

export function commit() {
  if (typeof window === "undefined" || !cache) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* quota exceeded: keep working in memory */
  }
}

export function resetDb() {
  cache = buildSeed();
  commit();
}

export const nowIso = () => new Date().toISOString();
export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ── auth helpers (mock JWT) ── */

export function hashPassword(password: string, salt = Math.random().toString(36).slice(2, 10)) {
  return `sha256$${salt}$${sha256(`${salt}:${password}`)}`;
}
export function verifyPassword(password: string, stored: string) {
  const [, salt, hex] = stored.split("$");
  return sha256(`${salt}:${password}`) === hex;
}

const b64 = (s: string) => (typeof btoa !== "undefined" ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s).toString("base64"));
const unb64 = (s: string) => (typeof atob !== "undefined" ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, "base64").toString());

export function issueToken(u: UserRecord) {
  const header = b64(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = b64(JSON.stringify({ sub: u.id, role: u.role, exp: Date.now() + 7 * 86400000 }));
  return `${header}.${payload}.mock`;
}

export function currentUser(): UserRecord | null {
  const t = getToken();
  if (!t) return null;
  try {
    const payload = JSON.parse(unb64(t.split(".")[1])) as { sub: string; exp: number };
    if (payload.exp < Date.now()) return null;
    const u = db().users.find((x) => x.id === payload.sub);
    if (!u || u.status === "suspended") return null;
    return u;
  } catch {
    return null;
  }
}

/** RBAC guard used by every protected mock route — mirrors the Express middleware. */
export function requireUser(roles?: Role[]): UserRecord {
  const u = currentUser();
  if (!u) throw new ApiError(401, "UNAUTHENTICATED", "Please log in to continue.");
  if (roles && !roles.includes(u.role)) throw new ApiError(403, "FORBIDDEN", "You don't have permission to do that.");
  u.lastActiveAt = nowIso();
  return u;
}

export function publicUser(u: UserRecord) {
  const rest: Partial<UserRecord> = { ...u };
  delete rest.passwordHash;
  return rest as Omit<UserRecord, "passwordHash">;
}

export function audit(actor: UserRecord, action: string, target: string, detail?: string) {
  const entry: AuditLog = { id: uid("aud"), actorId: actor.id, actorName: actor.name, action, target, detail, createdAt: nowIso() };
  db().audit.unshift(entry);
}

export function notify(userId: string, n: Omit<AppNotification, "id" | "userId" | "read" | "createdAt">) {
  const u = db().users.find((x) => x.id === userId);
  if (!u) return;
  const prefs = u.notificationPrefs;
  if ((n.type === "new_content" && !prefs.newContent) || (n.type === "deadline" && !prefs.deadlines) || (n.type === "result" && !prefs.results)) return;
  db().notifications.unshift({ ...n, id: uid("n"), userId, read: false, createdAt: nowIso() });
}

export function validate(fields: Record<string, string | false | undefined>) {
  const errors = Object.fromEntries(Object.entries(fields).filter(([, v]) => !!v)) as Record<string, string>;
  if (Object.keys(errors).length) throw new ApiError(422, "VALIDATION_ERROR", "Please check the highlighted fields.", errors);
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
export const passwordProblem = (p: string) =>
  p.length < 8 ? "Use at least 8 characters." : !/[A-Za-z]/.test(p) || !/\d/.test(p) ? "Include at least one letter and one number." : undefined;
