import type { Lesson, PracticeSet, Skill } from "@/lib/types";
import { MASTERY_THRESHOLD, applyResponse, initialMastery, paramsFor } from "./bkt";
import { contentScore, lessonVector, needVector } from "./recommender";

/**
 * Simulated A/B evaluation (proposal §4 "Evaluation Plan"). Synthetic learners
 * with hidden binary knowledge per micro-skill study one lesson per step under a
 * policy; each lesson is followed by its practice set, answered with BKT slip /
 * guess noise. We compare BKT + content-based filtering against a static
 * sequential curriculum and a popularity baseline.
 */

export type Policy = "adaptive" | "sequential" | "popularity";

export interface SimConfig {
  learners: number;
  steps: number;
  seed: number;
  masteryTarget: number; // fraction of skills that must be known to count as "mastered"
  learnRate: number; // probability that a lesson teaches an unknown tagged skill (scaled by Q-matrix weight)
}

export interface PolicyResult {
  policy: Policy;
  learningGain: number; // normalised gain g, averaged
  precisionAt3: number;
  mrr: number;
  timeToMastery: number; // mean steps (capped at config.steps + 1 when not reached)
  reachedMastery: number; // share of learners who reached the target
  curve: number[]; // mean post-test score after each step
}

export interface SimResult {
  config: SimConfig;
  results: PolicyResult[];
  elapsedMs: number;
}

export const DEFAULT_SIM: SimConfig = { learners: 200, steps: 24, seed: 2026, masteryTarget: 0.8, learnRate: 0.45 };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SLIP = 0.1;
const TEST_GUESS = 0.2;

function testScore(known: Record<string, boolean>, skills: Skill[]) {
  // expected score on a 1-item-per-skill diagnostic
  let s = 0;
  for (const sk of skills) s += known[sk.id] ? 1 - SLIP : TEST_GUESS;
  return s / skills.length;
}

export function simulate(lessons: Lesson[], sets: PracticeSet[], skills: Skill[], popularityOrder: string[], cfg: SimConfig = DEFAULT_SIM): SimResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const setById = new Map(sets.map((s) => [s.id, s]));
  const seq = [...lessons].sort((a, b) => a.skill.localeCompare(b.skill) || a.order - b.order);
  // interleave skills in the sequential curriculum the way the course is taught (L1, R1, W1, S1, L2, …)
  const bySkill = ["listening", "reading", "writing", "speaking"].map((s) => seq.filter((l) => l.skill === s));
  const sequential: Lesson[] = [];
  for (let i = 0; i < Math.max(...bySkill.map((x) => x.length)); i++) for (const track of bySkill) if (track[i]) sequential.push(track[i]);
  const popular = popularityOrder.map((id) => lessons.find((l) => l.id === id)).filter(Boolean) as Lesson[];
  for (const l of sequential) if (!popular.includes(l)) popular.push(l);

  const policies: Policy[] = ["adaptive", "sequential", "popularity"];
  const results: PolicyResult[] = policies.map((policy) => {
    const r = rng(cfg.seed); // same synthetic cohort for every policy
    let gainSum = 0, pSum = 0, mrrSum = 0, rankEvents = 0, ttmSum = 0, reached = 0;
    const curve = new Array(cfg.steps).fill(0);

    for (let n = 0; n < cfg.learners; n++) {
      const ability = 0.15 + r() * 0.55;
      const known: Record<string, boolean> = {};
      for (const s of skills) known[s.id] = r() < ability * (0.6 + r() * 0.8);
      let est: Record<string, number> = Object.fromEntries(skills.map((s) => [s.id, initialMastery(s.id)]));
      // warm start from the 30-question placement test: one noisy observation per skill
      for (const s of skills) {
        const correct = known[s.id] ? r() > SLIP : r() < 0.25;
        est = applyResponse(est, { id: "p", passageId: "p", type: "mcq", prompt: "", answerKey: "0", explanation: "", difficulty: 2, skills: [{ skillId: s.id, weight: 1 }] }, correct);
      }
      const pre = testScore(known, skills);
      const studied = new Set<string>();
      let ttm = cfg.steps + 1;
      let seqIdx = 0;

      for (let step = 0; step < cfg.steps; step++) {
        // rank candidate lessons
        let ranked: Lesson[];
        if (policy === "adaptive") {
          const need = needVector(est, skills, MASTERY_THRESHOLD);
          ranked = [...lessons].map((l) => ({ l, s: contentScore(need, lessonVector(l)) - (studied.has(l.id) ? 0.05 : 0) })).sort((a, b) => b.s - a.s).map((x) => x.l);
        } else if (policy === "sequential") {
          ranked = sequential.slice(seqIdx).concat(sequential.slice(0, seqIdx));
        } else {
          ranked = popular.filter((l) => !studied.has(l.id)).concat(popular.filter((l) => studied.has(l.id)));
        }
        const top3 = ranked.slice(0, 3);
        const relevant = (l: Lesson) => !known[l.skillIds[0]];
        pSum += top3.filter(relevant).length / 3;
        const firstRel = ranked.findIndex(relevant);
        mrrSum += firstRel >= 0 && firstRel < 10 ? 1 / (firstRel + 1) : 0;
        rankEvents++;

        // learner studies the top item
        const lesson = ranked[0];
        studied.add(lesson.id);
        if (policy === "sequential") seqIdx = (seqIdx + 1) % sequential.length;
        for (const [sid, w] of Object.entries(lessonVector(lesson))) if (!known[sid] && r() < cfg.learnRate * w) known[sid] = true;

        // practice set responses update the BKT estimate
        const set = setById.get(lesson.practiceSetId);
        if (set) {
          for (const q of set.questions) {
            const primary = q.skills[0]?.skillId;
            const g = paramsFor(primary, q.type).pGuess;
            const correct = known[primary] ? r() > SLIP : r() < g;
            est = applyResponse(est, q, correct);
          }
        }
        const knownShare = skills.filter((s) => known[s.id]).length / skills.length;
        curve[step] += testScore(known, skills);
        if (ttm > cfg.steps && knownShare >= cfg.masteryTarget) ttm = step + 1;
      }
      const post = testScore(known, skills);
      const maxScore = 1 - SLIP;
      gainSum += maxScore - pre > 0 ? (post - pre) / (maxScore - pre) : 0;
      ttmSum += ttm;
      if (ttm <= cfg.steps) reached++;
    }
    return {
      policy,
      learningGain: gainSum / cfg.learners,
      precisionAt3: pSum / rankEvents,
      mrr: mrrSum / rankEvents,
      timeToMastery: ttmSum / cfg.learners,
      reachedMastery: reached / cfg.learners,
      curve: curve.map((v) => v / cfg.learners),
    };
  });
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { config: cfg, results, elapsedMs: t1 - t0 };
}
