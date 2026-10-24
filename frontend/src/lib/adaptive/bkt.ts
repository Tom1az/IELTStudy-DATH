import params from "./bkt-params.json";
import type { Question, QuestionType, SkillCategory, Skill } from "@/lib/types";

export const MASTERY_THRESHOLD: number = params.threshold;

export interface BktParams {
  pInit: number;
  pTransit: number;
  pSlip: number;
  pGuess: number;
}

type SkillParams = { pInit: number; pTransit: number; pSlip: number };

export function paramsFor(skillId: string, type: QuestionType): BktParams {
  const s = (params.skills as Record<string, SkillParams>)[skillId] ?? params.default;
  const g = (params.guessByType as Record<string, number>)[type] ?? 0.2;
  return { pInit: s.pInit, pTransit: s.pTransit, pSlip: s.pSlip, pGuess: g };
}

export function initialMastery(skillId: string): number {
  return ((params.skills as Record<string, SkillParams>)[skillId] ?? params.default).pInit;
}

/** One Bayesian Knowledge Tracing step: posterior given the observation, then learning transition. */
export function bktUpdate(pKnown: number, correct: boolean, p: BktParams): number {
  const { pSlip: s, pGuess: g, pTransit: t } = p;
  const posterior = correct
    ? (pKnown * (1 - s)) / (pKnown * (1 - s) + (1 - pKnown) * g)
    : (pKnown * s) / (pKnown * s + (1 - pKnown) * (1 - g));
  const next = posterior + (1 - posterior) * t;
  return clamp(next, 0.01, 0.99);
}

/**
 * Multi-skill update via the Q-matrix: each tagged skill moves toward its BKT
 * update in proportion to the question's weight for that skill.
 */
export function applyResponse(mastery: Record<string, number>, q: Question, correct: boolean): Record<string, number> {
  const out = { ...mastery };
  for (const { skillId, weight } of q.skills) {
    const prev = out[skillId] ?? initialMastery(skillId);
    const full = bktUpdate(prev, correct, paramsFor(skillId, q.type));
    out[skillId] = round3(prev + weight * (full - prev));
  }
  return out;
}

/* ── answer scoring ── */

const normalise = (s: string) =>
  s.toLowerCase().trim().replace(/[’']/g, "'").replace(/[.,!?;:"()]/g, "").replace(/\s+/g, " ");
const normaliseNumber = (s: string) => s.replace(/[\s,]/g, "");

export function isCorrect(q: Question, answer: string | undefined): boolean {
  if (answer == null || answer === "") return false;
  if (q.type === "gap") {
    const a = normalise(answer);
    return q.answerKey.split("|").some((k) => {
      const key = normalise(k);
      return key === a || (/^[\d\s,]+$/.test(k) && normaliseNumber(key) === normaliseNumber(a));
    });
  }
  return answer.trim().toUpperCase() === q.answerKey.trim().toUpperCase();
}

/* ── band estimation ── */

/** Maps mastery probability to an indicative IELTS band (practice estimate, not official). */
export function masteryToBand(p: number): number {
  return clamp(Math.round((3 + 5 * p) * 2) / 2, 3, 9);
}

/** IELTS overall rounding: average of four, .25 rounds up to .5 and .75 rounds up to the next whole band. */
export function overallBand(bands: number[]): number {
  if (!bands.length) return 0;
  const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
  const whole = Math.floor(avg);
  const frac = avg - whole;
  if (frac < 0.25) return whole;
  if (frac < 0.75) return whole + 0.5;
  return whole + 1;
}

export function categoryMastery(mastery: Record<string, number>, skills: Skill[], category: SkillCategory): number {
  const ids = skills.filter((s) => s.category === category).map((s) => s.id);
  const vals = ids.map((id) => mastery[id] ?? initialMastery(id));
  return vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
}

export function bandsBySkill(mastery: Record<string, number>, skills: Skill[]) {
  const cats: SkillCategory[] = ["listening", "reading", "writing", "speaking"];
  const bands = Object.fromEntries(cats.map((c) => [c, masteryToBand(categoryMastery(mastery, skills, c))])) as Record<SkillCategory, number>;
  return { bands, overall: overallBand(Object.values(bands)) };
}

export function recommendedLevelForBand(band: number): 1 | 2 | 3 {
  if (band >= 6.5) return 3;
  if (band >= 5.0) return 2;
  return 1;
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
const round3 = (v: number) => Math.round(v * 1000) / 1000;
