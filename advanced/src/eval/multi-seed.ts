import { runSimulation } from "./simulator.ts";

// Usage: npm run eval:multi -- [numSeeds=10] [firstSeed=42] [numLearners=200] [maxSteps=40]
// Runs the simulation once per seed (firstSeed, firstSeed+1, ...) and reports mean, sample SD
// (n-1) and a 95% CI of the mean (t distribution). Seed changes the catalog popularity and the
// simulated learners. Within one seed all strategies see the SAME learners, so the strategy
// differences are paired: they are reported separately with a win count.

const numSeeds = Number(process.argv[2] ?? 10);
const firstSeed = Number(process.argv[3] ?? 42);
const numLearners = Number(process.argv[4] ?? 200);
const maxSteps = Number(process.argv[5] ?? 40);

const STRATEGIES = ["hybrid", "sequential", "popularity"] as const;
const METRICS = ["normalizedGain", "precisionAt3", "mrr", "censoredTimeMinutes", "reachedMasteryRate"] as const;
type Strategy = (typeof STRATEGIES)[number];
type Metric = (typeof METRICS)[number];

// Two-sided 95% t critical values by degrees of freedom (df = n - 1)
const T95: Record<number, number> = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 14: 2.145, 19: 2.093, 29: 2.045 };
const tCrit = (df: number) => T95[df] ?? (df > 29 ? 1.96 : T95[Object.keys(T95).map(Number).filter((k) => k <= df).pop()!]!);

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const ci95 = (xs: number[]) => (xs.length < 2 ? 0 : (tCrit(xs.length - 1) * sd(xs)) / Math.sqrt(xs.length));

const runs = Array.from({ length: numSeeds }, (_, i) => runSimulation(firstSeed + i, numLearners, maxSteps));
const seeds = Array.from({ length: numSeeds }, (_, i) => firstSeed + i);
const col = (s: Strategy, m: Metric) => runs.map((r) => r[s][m]);

console.log(`Seeds: ${seeds.join(", ")}  |  learners/seed: ${numLearners}  |  max steps: ${maxSteps}\n`);

const summary: Record<string, Record<string, string>> = {};
for (const s of STRATEGIES) {
  summary[s] = {};
  for (const m of METRICS) {
    const xs = col(s, m);
    const d = m === "censoredTimeMinutes" ? 0 : m === "reachedMasteryRate" ? 1 : 3;
    summary[s]![m] = `${mean(xs).toFixed(d)} ± ${sd(xs).toFixed(d)}`;
  }
}
console.log("Mean ± SD across seeds");
console.table(summary);

const ci: Record<string, Record<string, string>> = {};
for (const s of STRATEGIES) {
  ci[s] = {};
  for (const m of METRICS) {
    const d = m === "censoredTimeMinutes" ? 1 : 3;
    ci[s]![m] = `±${ci95(col(s, m)).toFixed(d)}`;
  }
}
console.log("95% CI half-width of the mean");
console.table(ci);

const paired: Record<string, Record<string, string>> = {};
for (const base of ["sequential", "popularity"] as const) {
  paired[`hybrid − ${base}`] = {};
  for (const m of METRICS) {
    const diffs = runs.map((r) => r.hybrid[m] - r[base][m]);
    const d = m === "censoredTimeMinutes" ? 0 : m === "reachedMasteryRate" ? 1 : 3;
    const lowerIsBetter = m === "censoredTimeMinutes";
    const wins = diffs.filter((x) => (lowerIsBetter ? x < 0 : x > 0)).length;
    paired[`hybrid − ${base}`]![m] = `${mean(diffs).toFixed(d)} ±${ci95(diffs).toFixed(d)} (hybrid better in ${wins}/${numSeeds})`;
  }
}
console.log("Paired difference per seed (mean ±95% CI, seeds where hybrid wins)");
console.table(paired);

console.log("Per-seed values (hybrid)");
console.table(Object.fromEntries(seeds.map((sd0, i) => [sd0, runs[i]!.hybrid])));
