import { describe, expect, it } from "vitest";
import { getBktParams } from "../config/bkt-params.ts";
import { runSimulation } from "../eval/simulator.ts";
import { computeBktStep } from "../services/bkt.ts";

describe("BKT Math & Simulation Unit Tests (100% Standalone)", () => {
  it("increases mastery probability on a correct answer and decreases on an incorrect answer", () => {
    const params = getBktParams("W_INVERSION");
    const afterCorrect = computeBktStep(params.pInit, true, 1.0, params, false);
    const afterWrong = computeBktStep(params.pInit, false, 1.0, params, true);

    expect(afterCorrect).toBeGreaterThan(params.pInit);
    expect(afterWrong).toBeLessThan(params.pInit);
  });

  it("matches a hand-computed update", () => {
    const params = { pLearn: 0.15, pSlip: 0.1, pGuess: 0.25, pForget: 0 };
    // Posterior 0.3 * 0.9 / (0.3 * 0.9 + 0.7 * 0.25) = 0.60674, then 0.60674 + 0.39326 * 0.15
    expect(computeBktStep(0.3, true, 1, params, false)).toBeCloseTo(0.6657, 4);
    // Half weight blends the posterior halfway, and no transitions for the diagnostic
    expect(computeBktStep(0.3, true, 0.5, params, true)).toBeCloseTo(0.4534, 4);
  });

  // The size the report uses. Small runs are noise: P@3 flips between seeds at 50 learners.
  it("evaluates Hybrid strategy higher than Sequential baseline on seed 42", () => {
    const results = runSimulation(42, 200, 40);
    expect(results.hybrid.normalizedGain).toBeGreaterThan(results.sequential.normalizedGain);
    expect(results.hybrid.precisionAt3).toBeGreaterThan(results.sequential.precisionAt3);
  });
});
