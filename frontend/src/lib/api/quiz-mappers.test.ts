import { describe, expect, it } from "vitest";
import type { BackendPassage, BackendQuestionForLearner, BackendQuizForLearner } from "./backend-types";
import { parseMatchingValue, toBackendAnswer, toQuestion, toSections, toUiAnswer } from "./quiz-mappers";

const mcq: BackendQuestionForLearner = {
  questionId: 1,
  passageId: null,
  questionType: "multiple_choice",
  questionText: "When do classes start?",
  options: [{ id: "A", text: "12 March" }, { id: "B", text: "14 March" }, { id: "C", text: "4 March" }],
};
const tfng: BackendQuestionForLearner = { questionId: 2, passageId: 10, questionType: "true_false_not_given", questionText: "Coffee came from Yemen.", options: null };
const gap: BackendQuestionForLearner = { questionId: 3, passageId: 10, questionType: "gap_fill", questionText: "Caller's surname: ______", options: null };
const matching: BackendQuestionForLearner = {
  questionId: 4,
  passageId: 10,
  questionType: "matching",
  questionText: "Match each paragraph to its heading.",
  options: { items: [{ id: "B", text: "Paragraph B" }, { id: "C", text: "Paragraph C" }], choices: [{ id: "i", text: "Pros" }, { id: "ii", text: "Cons" }] },
};

describe("toQuestion", () => {
  it("keeps multiple-choice option texts in order", () => {
    const q = toQuestion(mcq);
    expect(q.type).toBe("mcq");
    expect(q.options).toEqual(["12 March", "14 March", "4 March"]);
    expect(q.passageId).toBe("");
  });

  it("turns the first run of underscores into the gap input", () => {
    expect(toQuestion(gap).prompt).toBe("Caller's surname: ___");
    expect(toQuestion({ ...gap, questionText: "A ______ and a ______." }).prompt).toBe("A ___ and a ….");
    expect(toQuestion({ ...gap, questionText: "No blank here" }).prompt).toBe("No blank here ___");
  });

  it("keeps matching items and choices", () => {
    const q = toQuestion(matching);
    expect(q.type).toBe("matching");
    expect(q.matchItems?.map((i) => i.id)).toEqual(["B", "C"]);
    expect(q.matchChoices?.map((c) => c.id)).toEqual(["i", "ii"]);
  });
});

describe("answers in both directions", () => {
  it("maps a multiple-choice option index to its id and back", () => {
    expect(toBackendAnswer(mcq, "1")).toBe("B");
    expect(toUiAnswer(mcq, "B")).toBe("1");
    expect(toUiAnswer(mcq, "Z")).toBe("");
  });

  it("maps TRUE / FALSE / NOT GIVEN to the API's values and back", () => {
    expect(toBackendAnswer(tfng, "NOT GIVEN")).toBe("not_given");
    expect(toUiAnswer(tfng, "false")).toBe("FALSE");
  });

  it("trims gap answers and joins accepted answers for the review", () => {
    expect(toBackendAnswer(gap, "  Hartley ")).toBe("Hartley");
    expect(toUiAnswer(gap, ["colour", "color"])).toBe("colour|color");
  });

  it("sends a matching answer as an object", () => {
    expect(toBackendAnswer(matching, JSON.stringify({ B: "ii" }))).toEqual({ B: "ii" });
    expect(toUiAnswer(matching, { B: "ii", C: "i" })).toBe(JSON.stringify({ B: "ii", C: "i" }));
  });

  it("treats an empty answer as skipped", () => {
    expect(toBackendAnswer(mcq, "")).toBeNull();
    expect(toBackendAnswer(gap, "   ")).toBeNull();
    expect(toBackendAnswer(matching, "{}")).toBeNull();
  });

  it("reads a broken matching value as no answer", () => {
    expect(parseMatchingValue("not json")).toEqual({});
    expect(parseMatchingValue("")).toEqual({});
  });
});

describe("toSections", () => {
  const reading: BackendPassage = { passageId: 10, lessonId: 5, type: "reading_text", title: "Coffee", content: "First paragraph.\n\nSecond paragraph.", mediaPath: null, mediaUrl: null, orderIndex: 0 };
  const audio: BackendPassage = { passageId: 11, lessonId: 5, type: "listening_audio", title: "Booking", content: "Receptionist: Good morning.\nCaller: Hello.", mediaPath: "a.mp3", mediaUrl: null, orderIndex: 1 };
  const quiz: BackendQuizForLearner = {
    quizId: 7, kind: "lesson", title: "Check", questionCount: 4, timeLimitSeconds: 600, lessonId: 5, description: null,
    passages: [reading, audio],
    questions: [{ ...tfng }, { ...mcq, passageId: 11 }, { ...gap }, { ...mcq, questionId: 9, passageId: null }],
  };

  it("makes one section per passage, in the order the questions first use it", () => {
    const sections = toSections(quiz);
    expect(sections.map((s) => s.title)).toEqual(["Coffee", "Booking", "Other questions"]);
    expect(sections[0].questions.map((q) => q.id)).toEqual(["2", "3"]);
    expect(sections[0].passage.paragraphs.map((p) => p.text)).toEqual(["First paragraph.", "Second paragraph."]);
    expect(sections[0].minutes).toBe(10);
  });

  it("splits a listening transcript into speaker lines", () => {
    const listening = toSections(quiz)[1];
    expect(listening.passage.kind).toBe("listening");
    expect(listening.passage.audioScript).toEqual([{ speaker: "Receptionist", text: "Good morning." }, { speaker: "Caller", text: "Hello." }]);
  });

  it("uses the lesson's skill when it is known, and guesses from the passage otherwise", () => {
    expect(toSections(quiz, "writing").map((s) => s.skill)).toEqual(["writing", "writing", "writing"]);
    expect(toSections(quiz).map((s) => s.skill)).toEqual(["reading", "listening", "reading"]);
  });
});
