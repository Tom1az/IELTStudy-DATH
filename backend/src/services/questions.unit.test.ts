import { describe, expect, it } from "vitest";

import { assertWeightsSumToOne, checkQuestionShape } from "./questions.ts";

const choices = [
  { id: "A", text: "studied" },
  { id: "B", text: "had studied" },
];

const matchingOptions = {
  items: [
    { id: "B", text: "Paragraph B" },
    { id: "C", text: "Paragraph C" },
  ],
  choices: [
    { id: "i", text: "A compromise solution" },
    { id: "ii", text: "The case in favour" },
  ],
};

// checkQuestionShape throws an HttpError; these helpers read its status
const statusOf = (check: () => void) => {
  try {
    check();
    return 200;
  } catch (err) {
    return (err as { status?: number }).status;
  }
};

describe("checkQuestionShape", () => {
  it("accepts a valid question of each type", () => {
    expect(statusOf(() => checkQuestionShape("multiple_choice", choices, "B"))).toBe(200);
    expect(statusOf(() => checkQuestionShape("error_identification", choices, "A"))).toBe(200);
    expect(statusOf(() => checkQuestionShape("true_false_not_given", null, "not_given"))).toBe(200);
    expect(statusOf(() => checkQuestionShape("gap_fill", null, ["colour", "color"]))).toBe(200);
    expect(
      statusOf(() => checkQuestionShape("matching", matchingOptions, { B: "ii", C: "i" })),
    ).toBe(200);
  });

  it("rejects a choice question whose answer isn't one of its options", () => {
    expect(statusOf(() => checkQuestionShape("multiple_choice", choices, "C"))).toBe(400);
    expect(statusOf(() => checkQuestionShape("multiple_choice", choices, ["B"]))).toBe(400);
  });

  it("rejects a choice question with fewer than 2 options, or a repeated id", () => {
    expect(statusOf(() => checkQuestionShape("multiple_choice", [choices[0]!], "A"))).toBe(400);
    expect(
      statusOf(() =>
        checkQuestionShape(
          "multiple_choice",
          [
            { id: "A", text: "one" },
            { id: "A", text: "two" },
          ],
          "A",
        ),
      ),
    ).toBe(400);
    expect(statusOf(() => checkQuestionShape("multiple_choice", null, "A"))).toBe(400);
  });

  it("rejects options on true/false/not given and gap-fill questions", () => {
    expect(statusOf(() => checkQuestionShape("true_false_not_given", choices, "true"))).toBe(400);
    expect(statusOf(() => checkQuestionShape("gap_fill", choices, ["colour"]))).toBe(400);
  });

  it("rejects a wrong answer key on true/false/not given and gap-fill questions", () => {
    expect(statusOf(() => checkQuestionShape("true_false_not_given", null, "yes"))).toBe(400);
    expect(statusOf(() => checkQuestionShape("gap_fill", null, "colour"))).toBe(400);
  });

  it("requires a matching key to cover every item with a known choice, and nothing else", () => {
    const check = (answerKey: { [key: string]: string }) =>
      statusOf(() => checkQuestionShape("matching", matchingOptions, answerKey));

    expect(check({ B: "ii" })).toBe(400); // item C has no choice
    expect(check({ B: "ii", C: "iv" })).toBe(400); // unknown choice
    expect(check({ B: "ii", C: "i", D: "i" })).toBe(400); // unknown item
    expect(statusOf(() => checkQuestionShape("matching", choices, { B: "ii" }))).toBe(400);
  });
});

describe("assertWeightsSumToOne", () => {
  it("accepts weights that add up to 1, allowing for rounding", () => {
    expect(statusOf(() => assertWeightsSumToOne([{ skillId: 1, weight: 1 }]))).toBe(200);
    expect(
      statusOf(() =>
        assertWeightsSumToOne([
          { skillId: 1, weight: 0.7 },
          { skillId: 2, weight: 0.2 },
          { skillId: 3, weight: 0.1 },
        ]),
      ),
    ).toBe(200);
  });

  it("rejects weights that don't add up to 1", () => {
    expect(
      statusOf(() =>
        assertWeightsSumToOne([
          { skillId: 1, weight: 0.5 },
          { skillId: 2, weight: 0.4 },
        ]),
      ),
    ).toBe(400);
    expect(
      statusOf(() =>
        assertWeightsSumToOne([
          { skillId: 1, weight: 0.6 },
          { skillId: 2, weight: 0.6 },
        ]),
      ),
    ).toBe(400);
  });
});
