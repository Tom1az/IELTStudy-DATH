import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { applyResponse, bandsBySkill, bktUpdate, isCorrect, masteryToBand, overallBand, paramsFor, recommendedLevelForBand } from "./bkt";
import { recommendNext, recommendRemediation } from "./recommender";
import { simulate, DEFAULT_SIM } from "./simulation";
import { buildSeed } from "@/data/seed";
import { sha256 } from "@/lib/sha256";
import type { Question } from "@/lib/types";

const seed = buildSeed();
const mira = Object.fromEntries(seed.mastery.filter((m) => m.userId === "u-learner").map((m) => [m.skillId, m.masteryProb]));
const q = (over: Partial<Question>): Question => ({ id: "q", passageId: "p", type: "mcq", prompt: "", answerKey: "1", explanation: "", difficulty: 2, skills: [{ skillId: "R.TFNG", weight: 1 }], ...over });

describe("BKT", () => {
  it("raises mastery after a correct answer and lowers it after a wrong one", () => {
    const p = paramsFor("R.TFNG", "tfng");
    expect(bktUpdate(0.4, true, p)).toBeGreaterThan(0.4);
    expect(bktUpdate(0.4, false, p)).toBeLessThan(0.4);
  });
  it("weights multi-skill updates by the Q-matrix", () => {
    const m = applyResponse({ "R.TFNG": 0.4, "R.PARA": 0.4 }, q({ type: "tfng", answerKey: "TRUE", skills: [{ skillId: "R.TFNG", weight: 1 }, { skillId: "R.PARA", weight: 0.5 }] }), true);
    expect(m["R.TFNG"] - 0.4).toBeGreaterThan(m["R.PARA"] - 0.4);
    expect(m["R.PARA"]).toBeGreaterThan(0.4);
  });
});

describe("scoring", () => {
  it("accepts alternatives, case and number formatting for gap questions", () => {
    const g = q({ type: "gap", answerKey: "30,000|30000" });
    expect(isCorrect(g, "30 000")).toBe(true);
    expect(isCorrect(g, "30,000")).toBe(true);
    expect(isCorrect(q({ type: "gap", answerKey: "jet lag|jetlag" }), " Jet Lag. ")).toBe(true);
    expect(isCorrect(q({ type: "tfng", answerKey: "NOT GIVEN" }), "not given")).toBe(true);
    expect(isCorrect(q({}), "")).toBe(false);
  });
});

describe("bands", () => {
  it("uses IELTS overall rounding", () => {
    expect(overallBand([6, 5.5, 5, 5.5])).toBe(5.5);
    expect(overallBand([6.5, 6.5, 5, 7])).toBe(6.5); // 6.25 → 6.5
    expect(overallBand([6.5, 6.5, 6.5, 7])).toBe(6.5); // 6.625 → 6.5
    expect(overallBand([6.5, 6.5, 7, 7])).toBe(7); // 6.75 → 7
  });
  it("maps the seeded learner to the Figma dashboard bands", () => {
    const { bands, overall } = bandsBySkill(mira, seed.skills);
    expect(bands).toEqual({ listening: 6, reading: 5.5, writing: 5, speaking: 5.5 });
    expect(overall).toBe(5.5);
    expect(masteryToBand(0)).toBe(3);
    expect(recommendedLevelForBand(5)).toBe(2);
  });
});

describe("recommender", () => {
  it("reproduces the Figma 'Up next' list for the seeded learner", () => {
    const recs = recommendNext({ mastery: mira, skills: seed.skills, courses: seed.courses, lessons: seed.lessons, sets: seed.practiceSets, enrollments: seed.enrollments.filter((e) => e.userId === "u-learner") });
    expect(recs.map((r) => r.title)).toEqual(["True / False / Not Given", "Practice set 2.3", "Describing line graphs"]);
    expect(recs[0].reason).toContain("True / False / Not Given");
  });
  it("recommends remediation only for skills below the threshold", () => {
    const recs = recommendRemediation({ mastery: { ...mira, "R.TFNG": 0.3 }, skills: seed.skills, courses: seed.courses, lessons: seed.lessons, sets: seed.practiceSets, enrollments: seed.enrollments.filter((e) => e.userId === "u-learner"), testedSkillIds: ["R.TFNG", "R.SKIM"], excludeSetId: "ps-int-r3", currentLevel: 2 });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => r.skillId === "R.TFNG")).toBe(true);
    expect(recs.some((r) => r.targetId === "ps-int-r3")).toBe(false);
    const none = recommendRemediation({ mastery: { ...mira, "R.SKIM": 0.9 }, skills: seed.skills, courses: seed.courses, lessons: seed.lessons, sets: seed.practiceSets, enrollments: [], testedSkillIds: ["R.SKIM"] });
    expect(none).toEqual([]);
  });
});

describe("simulation", () => {
  it("adaptive policy beats the sequential baseline on gain and precision", () => {
    const lessons = seed.lessons.filter((l) => l.courseId === "c-intermediate");
    const r = simulate(lessons, seed.practiceSets, seed.skills, [], { ...DEFAULT_SIM, learners: 60 });
    const [ad, sq] = r.results;
    expect(ad.policy).toBe("adaptive");
    expect(ad.learningGain).toBeGreaterThan(sq.learningGain);
    expect(ad.precisionAt3).toBeGreaterThan(sq.precisionAt3);
  });
});

describe("seed", () => {
  it("has 30 placement questions and Figma lesson counts", () => {
    const placement = seed.practiceSets.filter((s) => s.id.startsWith("placement-"));
    expect(placement.reduce((n, s) => n + s.questions.length, 0)).toBe(30);
    expect(seed.lessons.filter((l) => l.courseId === "c-foundation")).toHaveLength(24);
    expect(seed.lessons.filter((l) => l.courseId === "c-intermediate")).toHaveLength(32);
    expect(seed.lessons.filter((l) => l.courseId === "c-advanced")).toHaveLength(32);
    const s23 = seed.practiceSets.find((s) => s.id === "ps-int-r3")!;
    expect(s23.code).toBe("2.3");
    expect(s23.questions).toHaveLength(6);
    expect(s23.minutes).toBe(12);
  });
  it("hashes seeded passwords with the same scheme as the mock auth", () => {
    expect(sha256("seed-salt:Password123!")).toBe(createHash("sha256").update("seed-salt:Password123!").digest("hex"));
    expect(sha256("")).toBe(createHash("sha256").update("").digest("hex"));
    expect(sha256("a".repeat(200) + "ữ")).toBe(createHash("sha256").update("a".repeat(200) + "ữ").digest("hex"));
  });
});
