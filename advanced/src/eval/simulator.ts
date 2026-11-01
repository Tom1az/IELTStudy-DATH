import { SEED_SKILL_CODES, getBktParams, MASTERY_THRESHOLD } from "../config/bkt-params.ts";
import { computeBktStep } from "../services/bkt.ts";

const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type SimLesson = {
  id: number;
  kind: "core" | "remedial";
  skillIdx: number;
  secondarySkillIdx: number;
  durationMinutes: number;
  gainFactor: number;
  popularity: number;
};

type Strategy = "hybrid" | "sequential" | "popularity";

export const runSimulation = (seed = 42, numLearners = 200, maxSteps = 40) => {
  const rng = createRng(seed);
  const numSkills = SEED_SKILL_CODES.length;

  const catalog: SimLesson[] = [];
  for (let i = 0; i < 120; i++) {
    const isRemedial = i >= 60;
    const skillIdx = i % numSkills;
    const secondarySkillIdx = (i + 3) % numSkills;
    catalog.push({
      id: i + 1,
      kind: isRemedial ? "remedial" : "core",
      skillIdx,
      secondarySkillIdx,
      durationMinutes: isRemedial ? 10 : 20,
      gainFactor: isRemedial ? 0.30 : 0.22,
      popularity: rng(),
    });
  }

  const strategies: Strategy[] = ["hybrid", "sequential", "popularity"];
  const summary: Record<
    Strategy,
    {
      normalizedGain: number;
      precisionAt3: number;
      mrr: number;
      censoredTimeMinutes: number;
      reachedMasteryRate: number;
    }
  > = {
    hybrid: { normalizedGain: 0, precisionAt3: 0, mrr: 0, censoredTimeMinutes: 0, reachedMasteryRate: 0 },
    sequential: { normalizedGain: 0, precisionAt3: 0, mrr: 0, censoredTimeMinutes: 0, reachedMasteryRate: 0 },
    popularity: { normalizedGain: 0, precisionAt3: 0, mrr: 0, censoredTimeMinutes: 0, reachedMasteryRate: 0 },
  };

  for (const strategy of strategies) {
    const lRng = createRng(seed);
    let totalGain = 0;
    let totalP3 = 0;
    let totalMrr = 0;
    let totalTime = 0;
    let reachedCount = 0;

    for (let u = 0; u < numLearners; u++) {
      const trueMastery: number[] = [];
      const estMastery: number[] = [];

      for (let s = 0; s < numSkills; s++) {
        const p = Math.max(0.1, Math.min(0.85, 0.25 + lRng() * 0.5));
        trueMastery.push(p);
        const params = getBktParams(SEED_SKILL_CODES[s]!.code);
        const isCorrect = lRng() < p * (1 - params.pSlip) + (1 - p) * params.pGuess;
        estMastery.push(computeBktStep(params.pInit, isCorrect, 1.0, params, true));
      }

      const preScore = (trueMastery.reduce((a, b) => a + b, 0) / numSkills) * 100;

      const top3 = rankCatalog(strategy, catalog, estMastery, new Set()).slice(0, 3);
      let relCount = 0;
      let reciprocalRank = 0;
      for (let r = 0; r < top3.length; r++) {
        const isRelevant = trueMastery[top3[r]!.skillIdx]! < MASTERY_THRESHOLD;
        if (isRelevant) {
          relCount++;
          if (reciprocalRank === 0) reciprocalRank = 1 / (r + 1);
        }
      }
      totalP3 += relCount / 3;
      totalMrr += reciprocalRank;

      const completed = new Set<number>();
      let spentMinutes = 0;
      let reachedAll = false;

      for (let step = 0; step < maxSteps; step++) {
        if (trueMastery.every((m) => m >= MASTERY_THRESHOLD)) {
          reachedAll = true;
          break;
        }

        const ranked = rankCatalog(strategy, catalog, estMastery, completed);
        const chosen = ranked[0] ?? catalog[step % catalog.length]!;
        completed.add(chosen.id);
        spentMinutes += chosen.durationMinutes;

        const s1 = chosen.skillIdx;
        trueMastery[s1] = Math.min(
          0.99,
          trueMastery[s1]! + (1 - trueMastery[s1]!) * chosen.gainFactor,
        );

        const params = getBktParams(SEED_SKILL_CODES[s1]!.code);
        const correct =
          lRng() < trueMastery[s1]! * (1 - params.pSlip) + (1 - trueMastery[s1]!) * params.pGuess;
        estMastery[s1] = computeBktStep(estMastery[s1]!, correct, 1.0, params, false);
      }

      if (trueMastery.every((m) => m >= MASTERY_THRESHOLD)) {
        reachedAll = true;
      }
      if (reachedAll) reachedCount++;

      const postScore = (trueMastery.reduce((a, b) => a + b, 0) / numSkills) * 100;
      const g = preScore < 100 ? (postScore - preScore) / (100 - preScore) : 0;

      totalGain += g;
      totalTime += spentMinutes;
    }

    summary[strategy] = {
      normalizedGain: Number((totalGain / numLearners).toFixed(3)),
      precisionAt3: Number((totalP3 / numLearners).toFixed(3)),
      mrr: Number((totalMrr / numLearners).toFixed(3)),
      censoredTimeMinutes: Math.round(totalTime / numLearners),
      reachedMasteryRate: Number(((reachedCount / numLearners) * 100).toFixed(1)),
    };
  }

  return summary;
};

const rankCatalog = (
  strategy: Strategy,
  catalog: SimLesson[],
  estMastery: number[],
  completed: Set<number>,
): SimLesson[] => {
  const available = catalog.filter((l) => !completed.has(l.id));
  const pool = available.length > 0 ? available : catalog;

  if (strategy === "sequential") {
    return [...pool].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "core" ? -1 : 1;
      return a.id - b.id;
    });
  }

  if (strategy === "popularity") {
    return [...pool].sort((a, b) => b.popularity - a.popularity);
  }

  return [...pool].sort((a, b) => {
    const gapA = Math.max(0, MASTERY_THRESHOLD - estMastery[a.skillIdx]!);
    const gapB = Math.max(0, MASTERY_THRESHOLD - estMastery[b.skillIdx]!);
    const scoreA = gapA * 2.0 + (a.kind === "remedial" && gapA > 0 ? 0.25 : 0);
    const scoreB = gapB * 2.0 + (b.kind === "remedial" && gapB > 0 ? 0.25 : 0);
    return scoreB - scoreA;
  });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  console.table(runSimulation(42, 200, 40));
}
