import type { Passage, PracticeSet, Question, SkillCategory } from "@/lib/types";
import type { BackendAnswer, BackendAnswerKey, BackendPassage, BackendQuestionForLearner, BackendQuizForLearner } from "./backend-types";

/**
 * Converts backend quizzes and questions into the UI's practice sets, and answers in
 * both directions. The quiz player keeps every answer as a string:
 *
 * | Backend type                              | UI type    | UI answer value                          | Backend answer          |
 * | ----------------------------------------- | ---------- | ---------------------------------------- | ----------------------- |
 * | `multiple_choice`, `error_identification` | `mcq`      | option index: "0", "1", ...              | option id: "A", "B", ...|
 * | `true_false_not_given`                    | `tfng`     | "TRUE", "FALSE", "NOT GIVEN"             | "true", "false", "not_given" |
 * | `gap_fill`                                | `gap`      | the text typed                           | the same text           |
 * | `matching`                                | `matching` | JSON text of item id → choice id         | the object itself       |
 */

const TFNG_TO_UI: Record<string, string> = { true: "TRUE", false: "FALSE", not_given: "NOT GIVEN" };
const TFNG_TO_BACKEND: Record<string, string> = { TRUE: "true", FALSE: "false", "NOT GIVEN": "not_given" };

/** The options of a multiple-choice question, or [] for the other types. */
function choiceOptions(q: BackendQuestionForLearner) {
  return Array.isArray(q.options) ? q.options : [];
}

/** The `{ items, choices }` of a matching question, or empty lists for the other types. */
function matchingOptions(q: BackendQuestionForLearner) {
  if (q.options && !Array.isArray(q.options)) return q.options;
  return { items: [], choices: [] };
}

/**
 * The gap-fill input goes where the prompt has "___". Backend texts mark the blank with
 * a run of underscores ("Caller's surname: ______"), so the first run becomes the input.
 * A text without a blank gets one at the end.
 */
function gapPrompt(text: string) {
  const parts = text.split(/_{3,}/);
  if (parts.length === 1) return `${text} ___`;
  // Any further runs are shown as "…", so there is only one input
  return parts[0] + "___" + parts.slice(1).join("…");
}

/** A learner-view question as a UI `Question`. The answer and explanation are empty until review. */
export function toQuestion(q: BackendQuestionForLearner): Question {
  const base: Question = {
    id: String(q.questionId),
    passageId: q.passageId === null ? "" : String(q.passageId),
    type: "mcq",
    prompt: q.questionText,
    answerKey: "",
    explanation: "",
  };
  if (q.questionType === "true_false_not_given") return { ...base, type: "tfng" };
  if (q.questionType === "gap_fill") return { ...base, type: "gap", prompt: gapPrompt(q.questionText), wordLimit: "Your answer" };
  if (q.questionType === "matching") {
    const { items, choices } = matchingOptions(q);
    return { ...base, type: "matching", matchItems: items, matchChoices: choices };
  }
  // multiple_choice and error_identification are both "pick one option"
  return { ...base, type: "mcq", options: choiceOptions(q).map((o) => o.text) };
}

/** Reads the matching answer the player stores as JSON text. A broken or empty value is no answer. */
export function parseMatchingValue(value: string): Record<string, string> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** The UI answer as the backend expects it, or null when the question was skipped. */
export function toBackendAnswer(q: BackendQuestionForLearner, value: string): BackendAnswer | null {
  if (value.trim() === "") return null;
  if (q.questionType === "true_false_not_given") return TFNG_TO_BACKEND[value] ?? null;
  if (q.questionType === "gap_fill") return value.trim();
  if (q.questionType === "matching") {
    const picked = parseMatchingValue(value);
    return Object.keys(picked).length > 0 ? picked : null;
  }
  const option = choiceOptions(q)[Number(value)];
  return option ? option.id : null;
}

/** A backend answer or answer key as the UI value (used by the post-quiz review). */
export function toUiAnswer(q: BackendQuestionForLearner, answer: BackendAnswer | BackendAnswerKey | null): string {
  if (answer === null) return "";
  if (q.questionType === "matching") return typeof answer === "object" && !Array.isArray(answer) ? JSON.stringify(answer) : "";
  // Gap fill keys list every accepted answer; the review shows them as "colour / color"
  if (Array.isArray(answer)) return answer.join("|");
  if (typeof answer !== "string") return "";
  if (q.questionType === "true_false_not_given") return TFNG_TO_UI[answer] ?? answer;
  if (q.questionType === "gap_fill") return answer;
  const index = choiceOptions(q).findIndex((o) => o.id === answer);
  return index >= 0 ? String(index) : "";
}

/**
 * A listening transcript such as "Receptionist: Good morning..." becomes one script line
 * per line of text, so the browser can read it aloud when no audio file was uploaded.
 */
function scriptLines(transcript: string) {
  const lines: { speaker?: string; text: string }[] = [];
  for (const raw of transcript.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const match = /^([A-Z][\w .'-]{0,30}):\s+(.*)$/.exec(line);
    if (match) lines.push({ speaker: match[1], text: match[2] });
    else lines.push({ text: line });
  }
  return lines;
}

function toPassage(p: BackendPassage | undefined): Passage {
  // Questions without a passage (grammar, vocabulary...) get an empty one; the player says so
  if (!p) return { kind: "reading", title: "", paragraphs: [] };
  if (p.type === "reading_text") {
    const paragraphs = (p.content ?? "").split(/\n\s*\n/).filter((t) => t.trim() !== "").map((text) => ({ text: text.trim() }));
    return { kind: "reading", title: p.title ?? "Reading passage", paragraphs };
  }
  return { kind: "listening", title: p.title ?? "Recording", paragraphs: [], audioUrl: p.mediaUrl ?? undefined, audioScript: scriptLines(p.content ?? "") };
}

/**
 * Splits a quiz into the player's sections: one per passage, in the order the questions
 * first use it, plus one for questions without a passage. Questions keep the quiz order
 * inside each section. `skill` is the quiz's skill when it is known (from its lesson);
 * otherwise each section guesses it from its passage.
 */
export function toSections(quiz: BackendQuizForLearner, skill?: SkillCategory): PracticeSet[] {
  const order: string[] = [];
  const byPassage = new Map<string, BackendQuestionForLearner[]>();
  for (const q of quiz.questions) {
    const key = q.passageId === null ? "none" : String(q.passageId);
    if (!byPassage.has(key)) {
      byPassage.set(key, []);
      order.push(key);
    }
    byPassage.get(key)!.push(q);
  }

  const sections: PracticeSet[] = [];
  for (const key of order) {
    const backendPassage = quiz.passages.find((p) => String(p.passageId) === key);
    const passage = toPassage(backendPassage);
    let sectionSkill: SkillCategory = skill ?? "reading";
    if (!skill && passage.kind === "listening") sectionSkill = "listening";
    sections.push({
      id: `${quiz.quizId}-${key}`,
      lessonId: quiz.lessonId === null ? null : String(quiz.lessonId),
      skill: sectionSkill,
      title: backendPassage?.title ?? (order.length > 1 ? "Other questions" : quiz.title),
      minutes: quiz.timeLimitSeconds ? Math.round(quiz.timeLimitSeconds / 60) : 0,
      passage,
      questions: byPassage.get(key)!.map(toQuestion),
    });
  }
  return sections;
}
