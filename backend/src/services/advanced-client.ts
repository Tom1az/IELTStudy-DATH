// Calls the standalone Advanced service (BKT mastery + recommendations, see ../../advanced).
//
// Advanced runs on its own port and shares the database and JWT_SECRET with this backend. It
// reads the learner from the token we forward, so no account data is copied between the two
// services. Everything here fails soft: if Advanced is not configured, is down, or is slow, the
// learner's request still succeeds and the Phase 3 parts stay empty (no mastery, nothing locked),
// exactly as they were before Phase 3.

import { httpError } from "../utils/http-error.ts";
import type { PublicUser } from "../utils/public-user.ts";

const TIMEOUT_MS = 5000;

export interface AdvancedAttemptOutcome {
  masteryChanges: unknown[];
  recommendations: unknown[];
}

export interface LessonGate {
  lessonId: number;
  locked: boolean;
  reason: string | null;
}

const baseUrl = () => {
  const url = process.env.ADVANCED_SERVICE_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
};

// One call to Advanced with the caller's own `Authorization` header forwarded as-is. Returns the
// parsed JSON body, or null when Advanced can't be used.
const callAdvanced = async (
  method: "GET" | "POST",
  path: string,
  authorization: string | undefined,
): Promise<Record<string, unknown> | null> => {
  const base = baseUrl();
  if (!base || !authorization) return null;

  try {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`Advanced service answered ${res.status} for ${method} ${path}`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.error("Advanced service is not reachable:", err instanceof Error ? err.message : err);
    return null;
  }
};

const toOutcome = (body: Record<string, unknown> | null): AdvancedAttemptOutcome | null => {
  if (!body) return null;
  return {
    masteryChanges: Array.isArray(body.masteryChanges) ? body.masteryChanges : [],
    recommendations: Array.isArray(body.recommendations) ? body.recommendations : [],
  };
};

// `POST /mastery/attempts/{attemptId}/process` on Advanced: updates the learner's BKT mastery for
// a submitted attempt and generates recommendations. Safe to repeat: an attempt is applied once.
export const processAttemptWithAdvanced = async (
  attemptId: number,
  authorization: string | undefined,
): Promise<AdvancedAttemptOutcome | null> =>
  toOutcome(await callAdvanced("POST", `/mastery/attempts/${attemptId}/process`, authorization));

// `GET /mastery/attempts/{attemptId}` on Advanced: what BKT stored for an attempt that was already
// processed. Read-only, so it is what the post-quiz review uses every time it is opened.
export const fetchAttemptOutcome = async (
  attemptId: number,
  authorization: string | undefined,
): Promise<AdvancedAttemptOutcome | null> =>
  toOutcome(await callAdvanced("GET", `/mastery/attempts/${attemptId}`, authorization));

// `GET /courses/{courseId}/gates` on Advanced: for each lesson of the course, whether this learner
// has unlocked it yet. Null when Advanced can't be used, in which case nothing is locked.
export const fetchCourseGates = async (
  courseId: number,
  authorization: string | undefined,
): Promise<Map<number, LessonGate> | null> => {
  const body = await callAdvanced("GET", `/courses/${courseId}/gates`, authorization);
  if (!body || !Array.isArray(body.gates)) return null;

  const gates = new Map<number, LessonGate>();
  for (const gate of body.gates as LessonGate[]) {
    gates.set(gate.lessonId, gate);
  }
  return gates;
};

// A learner can't use a lesson they haven't unlocked yet (403, as the contract says). Every way
// into a lesson calls this: opening it, saving progress and opening or starting its quiz. Staff
// are never gated, and if Advanced can't be used nothing is locked.
export const assertLessonUnlocked = async (
  lesson: { lessonId: number; courseId: number },
  user: PublicUser,
  authorization: string | undefined,
) => {
  if (user.role !== "learner") return;

  const gates = await fetchCourseGates(lesson.courseId, authorization);
  const gate = gates?.get(lesson.lessonId);
  if (gate?.locked) {
    throw httpError(403, gate.reason ?? "This lesson is locked");
  }
};
