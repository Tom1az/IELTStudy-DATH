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

  it("evaluates Hybrid strategy higher than Sequential baseline on seed 42", () => {
    const results = runSimulation(42, 50, 20);
    expect(results.hybrid.normalizedGain).toBeGreaterThan(results.sequential.normalizedGain);
    expect(results.hybrid.precisionAt3).toBeGreaterThan(results.sequential.precisionAt3);
  });
});
