import { describe, expect, it } from "vitest";

import { checkAnswerShape, isAnswerCorrect } from "./grading.ts";
import type { Answer } from "./grading.ts";
import type { QuestionType } from "./questions.ts";

// checkAnswerShape throws an HttpError; this helper reads its status
const shapeStatus = (type: QuestionType, answer: Answer) => {
  try {
    checkAnswerShape(type, answer, 1);
    return 200;
  } catch (err) {
    return (err as { status?: number }).status;
  }
};

describe("checkAnswerShape", () => {
  it("accepts a text answer for every type except matching", () => {
    expect(shapeStatus("multiple_choice", "B")).toBe(200);
    expect(shapeStatus("error_identification", "C")).toBe(200);
    expect(shapeStatus("true_false_not_given", "not_given")).toBe(200);
    expect(shapeStatus("gap_fill", "colour")).toBe(200);
  });

  it("accepts an object answer for matching only", () => {
    expect(shapeStatus("matching", { B: "ii" })).toBe(200);
    expect(shapeStatus("multiple_choice", { B: "ii" })).toBe(400);
    expect(shapeStatus("gap_fill", { B: "ii" })).toBe(400);
  });

  it("rejects a text answer for matching", () => {
    expect(shapeStatus("matching", "ii")).toBe(400);
  });
});

describe("isAnswerCorrect", () => {
  it("grades multiple choice and error identification by the exact option id", () => {
    expect(isAnswerCorrect("multiple_choice", "B", "B")).toBe(true);
    expect(isAnswerCorrect("multiple_choice", "B", "A")).toBe(false);
    expect(isAnswerCorrect("multiple_choice", "B", "b")).toBe(false);
    expect(isAnswerCorrect("error_identification", "C", "C")).toBe(true);
    expect(isAnswerCorrect("error_identification", "C", "D")).toBe(false);
  });

  it("grades true/false/not given exactly", () => {
    expect(isAnswerCorrect("true_false_not_given", "not_given", "not_given")).toBe(true);
    expect(isAnswerCorrect("true_false_not_given", "not_given", "false")).toBe(false);
  });

  it("accepts any gap-fill answer, ignoring case and extra spaces", () => {
    const key = ["colour", "color"];
    expect(isAnswerCorrect("gap_fill", key, "colour")).toBe(true);
    expect(isAnswerCorrect("gap_fill", key, "  Color ")).toBe(true);
    expect(isAnswerCorrect("gap_fill", ["city  centre"], "City centre")).toBe(true);
    expect(isAnswerCorrect("gap_fill", key, "colours")).toBe(false);
  });

  it("grades matching all or nothing", () => {
    const key = { B: "ii", C: "i" };
    expect(isAnswerCorrect("matching", key, { C: "i", B: "ii" })).toBe(true);
    // one wrong item
    expect(isAnswerCorrect("matching", key, { B: "ii", C: "ii" })).toBe(false);
    // one item missing
    expect(isAnswerCorrect("matching", key, { B: "ii" })).toBe(false);
    // an extra item that isn't in the key
    expect(isAnswerCorrect("matching", key, { B: "ii", C: "i", D: "iii" })).toBe(false);
  });

  it("grades a wrong shape as wrong", () => {
    expect(isAnswerCorrect("matching", { B: "ii" }, "ii")).toBe(false);
    expect(isAnswerCorrect("multiple_choice", "B", { B: "B" })).toBe(false);
  });
});
