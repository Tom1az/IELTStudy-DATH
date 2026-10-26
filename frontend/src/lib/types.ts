// Types the pages use. The API modules in `lib/api` build them from the backend's
// responses (`lib/api/backend-types.ts`, copied from `backend/src/docs/openapi.yaml`).

export type Role = "learner" | "instructor" | "admin";
export type AccountStatus = "active" | "suspended";
export type SkillCategory = "listening" | "reading" | "writing" | "speaking";
export const SKILL_CATEGORIES: SkillCategory[] = ["listening", "reading", "writing", "speaking"];

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: AccountStatus;
  /** 0 means "no target set yet". */
  targetBand: number;
  createdAt: string;
  /** Learners: whether the diagnostic (placement quiz) is finished. Always true for staff. */
  placementDone: boolean;
}

/** A micro-skill from the taxonomy, e.g. R_TFNG (Reading: True/False/Not Given). */
export interface Skill {
  id: string;
  code: string;
  category: SkillCategory;
  name: string;
  description: string;
}

/** "published" is an approved course, "pending" one waiting for review, "hidden" an archived one. */
export type CourseStatus = "draft" | "pending" | "published" | "hidden" | "rejected";
export type Level = 1 | 2 | 3;

export interface Course {
  id: string;
  level: Level;
  levelName: string; // Beginner / Intermediate / Advanced
  title: string;
  description: string;
  instructorId: string;
  status: CourseStatus;
  reviewFeedback?: string;
  submittedAt?: string;
  updatedAt: string;
  createdAt: string;
}

export interface Lesson {
  id: string;
  courseId: string;
  /** The skill section the lesson is listed under (the category of its heaviest skill tag). */
  skill: SkillCategory;
  order: number; // 1-based inside its skill section
  title: string;
  /** Lesson text in Markdown. */
  content: string | null;
}

export type QuestionType = "mcq" | "tfng" | "gap" | "matching";

/** One skill a question measures, with its Q-matrix weight (0..1). */
export interface QuestionSkill {
  skillId: string;
  weight: number;
}

export interface Question {
  id: string;
  passageId: string;
  type: QuestionType;
  prompt: string; // for gap: use ___ for the blank
  options?: string[]; // mcq options (letters added in UI)
  answerKey: string; // tfng: TRUE|FALSE|NOT GIVEN ; mcq: option index "0".."3" ; gap: accepted answers separated by | ; matching: JSON of item id → choice id
  explanation: string;
  wordLimit?: string; // placeholder in the gap input
  /** matching only: the items to match (e.g. paragraphs) and the choices (e.g. headings). */
  matchItems?: { id: string; text: string }[];
  matchChoices?: { id: string; text: string }[];
}

export interface Passage {
  kind: "reading" | "listening";
  title: string;
  paragraphs: { label?: string; text: string }[];
  /** Listening: without an uploaded audio file, the script is read aloud by speech synthesis in the browser. */
  audioUrl?: string;
  audioScript?: { speaker?: string; text: string }[];
}

/** One section of a quiz in the player: a passage and the questions about it. */
export interface PracticeSet {
  id: string;
  lessonId: string | null;
  skill: SkillCategory;
  title: string;
  minutes: number; // 0 = no time limit
  passage: Passage;
  questions: Question[];
}

export interface QuestionResponse {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  attemptOrder: number;
  responseTimeSeconds: number;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  kind: "practice" | "placement";
  status: "in_progress" | "submitted";
  answers: Record<string, string>;
  remainingSeconds?: number;
  totalScore: number;
  maxScore: number;
  startedAt: string;
  completedAt?: string;
  responses: QuestionResponse[];
}

export interface Enrollment {
  courseId: string;
  status: "active" | "completed";
  enrolledAt: string;
  completedAt?: string;
  completedLessonIds: string[];
}

export interface Recommendation {
  id: string;
  kind: "lesson" | "practice";
  targetId: string; // lesson id or quiz id
  courseId: string;
  title: string;
  skill: SkillCategory;
  score: number;
  reason: string;
  skillId?: string;
  mastery?: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorShape {
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string>;
}
