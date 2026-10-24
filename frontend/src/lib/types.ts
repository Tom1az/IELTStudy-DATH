// Domain types. They mirror the relational model in the IELTStudy proposal (§5)
// so the mock API and the Express/PostgreSQL backend share one contract.

export type Role = "learner" | "instructor" | "admin";
export type AccountStatus = "active" | "suspended" | "pending";
export type SkillCategory = "listening" | "reading" | "writing" | "speaking";
export const SKILL_CATEGORIES: SkillCategory[] = ["listening", "reading", "writing", "speaking"];

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: AccountStatus;
  targetBand: number;
  bio?: string;
  createdAt: string;
  lastActiveAt?: string;
  placementDone: boolean;
  placementBand?: number;
  recommendedLevel?: 1 | 2 | 3;
  notificationPrefs: { newContent: boolean; deadlines: boolean; results: boolean; email: boolean };
}

/** Users table row incl. the hashed password (mock store only, never returned by the API). */
export interface UserRecord extends User {
  passwordHash: string;
}

/** Micro-skill tag (Skills table). e.g. R.TFNG – Reading: True/False/Not Given */
export interface Skill {
  id: string;
  code: string;
  category: SkillCategory;
  name: string;
  description: string;
  /** Prerequisite skill ids (used for the mastery map ordering). */
  prerequisites?: string[];
}

export type CourseStatus = "draft" | "pending" | "published" | "hidden" | "rejected";
export type Level = 1 | 2 | 3;

export interface Course {
  id: string;
  slug: string;
  level: Level;
  levelName: string; // Foundation / Intermediate / Advanced
  title: string; // IELTS Intermediate
  bandRange: string; // "Band 5.5 – 6.5"
  tagline: string;
  catalogBlurb: string;
  instructorId: string;
  status: CourseStatus;
  prerequisiteText: string;
  prerequisiteBand?: number;
  hours: number;
  outcomes: string[];
  includes: string[];
  reviewFeedback?: string;
  submittedAt?: string;
  updatedAt: string;
  createdAt: string;
}

export type LessonStatus = "published" | "hidden" | "draft";

export interface LessonResource {
  id: string;
  title: string;
  meta: string; // "14 pages" / "30 words · PDF"
  kind: "pdf" | "slides" | "doc" | "link";
  url?: string;
}

export interface WorkedExample {
  quote: string;
  items: { tag: string; tone: "true" | "false" | "ng" | "neutral"; statement: string; explanation: string }[];
}

export interface Lesson {
  id: string;
  courseId: string;
  skill: SkillCategory;
  order: number; // 1-based inside its skill section
  title: string;
  shortTitle?: string;
  videoMinutes: number;
  videoUrl?: string;
  captionsUrl?: string;
  freePreview: boolean;
  status: LessonStatus;
  skillIds: string[]; // micro-skills taught
  strategy: string[];
  workedExample?: WorkedExample;
  bodyText?: string; // text material (second content type)
  transcript: string;
  resources: LessonResource[];
  practiceSetId: string;
  updatedAt: string;
}

export type QuestionType = "tfng" | "ynng" | "mcq" | "gap" | "heading";

export interface QuestionSkill {
  skillId: string;
  weight: number; // Q-matrix weight, 0..1
}

export interface Question {
  id: string;
  passageId: string; // practice set id
  groupLabel?: string; // "Questions 1–4"
  groupInstruction?: string;
  type: QuestionType;
  prompt: string; // for gap: use ___ for the blank
  options?: string[]; // mcq / heading options (letters added in UI)
  answerKey: string; // tfng: TRUE|FALSE|NOT GIVEN ; mcq: option index "0".."3" ; gap: accepted answers separated by |
  explanation: string;
  difficulty: 1 | 2 | 3;
  wordLimit?: string; // "ONE WORD"
  skills: QuestionSkill[];
}

export interface Passage {
  kind: "reading" | "listening" | "writing" | "speaking";
  title: string;
  paragraphs: { label?: string; text: string }[];
  /** Listening: a script read aloud by speech synthesis in the browser if no audioUrl. */
  audioUrl?: string;
  audioScript?: { speaker?: string; text: string }[];
}

export interface PracticeSet {
  id: string;
  code: string; // "2.3"
  courseId: string | null; // null = placement
  lessonId: string | null;
  skill: SkillCategory;
  title: string; // "True / False / Not Given"
  minutes: number;
  passage: Passage;
  questions: Question[];
  status: "published" | "hidden";
}

export interface QuestionResponse {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  attemptOrder: number;
  responseTimeSeconds: number;
}

export type AttemptKind = "practice" | "placement";

export interface QuizAttempt {
  id: string;
  userId: string;
  quizId: string; // practice set id or "placement"
  kind: AttemptKind;
  status: "in_progress" | "submitted";
  answers: Record<string, string>;
  flagged?: string[];
  remainingSeconds?: number;
  totalScore: number;
  maxScore: number;
  startedAt: string;
  completedAt?: string;
  responses: QuestionResponse[];
  masteryBefore?: Record<string, number>;
  masteryAfter?: Record<string, number>;
  recommendationIds?: string[];
}

export interface Enrollment {
  id: string;
  userId: string;
  courseId: string;
  status: "active" | "completed" | "left";
  enrolledAt: string;
  completedAt?: string;
  completedLessonIds: string[];
  lastLessonId?: string;
  lastPositionSeconds?: Record<string, number>;
  /** Targeted-remediation gates created when a skill drops below the mastery threshold. */
  remediation?: RemediationGate[];
}

export interface RemediationGate {
  id: string;
  skillId: string;
  beforeLessonId: string; // the next lesson that is gated
  fromSetId: string;
  masteryAtCreation: number;
  recommendationTargets: string[]; // lesson / practice-set ids that clear the gate when finished
  createdAt: string;
  clearedAt?: string;
  clearedBy?: "mastery" | "remediation" | "override";
}

export interface UserSkillMastery {
  userId: string;
  skillId: string;
  masteryProb: number;
  attempts: number;
  updatedAt: string;
}

export interface Recommendation {
  id: string;
  kind: "lesson" | "practice";
  targetId: string; // lesson id or practice set id
  courseSlug: string;
  title: string;
  skill: SkillCategory;
  minutes: number;
  score: number;
  reason: string;
  skillId?: string;
  mastery?: number;
  source: "remediation" | "sequence" | "placement";
}

export interface DiscussionPost {
  id: string;
  lessonId: string;
  userId: string;
  authorName: string;
  authorRole: Role;
  body: string;
  parentId?: string;
  createdAt: string;
  hidden?: boolean;
}

export type NotificationType = "new_content" | "deadline" | "result" | "system" | "review";

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface ContentReport {
  id: string;
  targetType: "post" | "lesson" | "question";
  targetId: string;
  targetPreview: string;
  reason: string;
  details?: string;
  reporterId: string;
  reporterName: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
  resolvedBy?: string;
  resolution?: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  target: string;
  detail?: string;
  createdAt: string;
}

/** Writing task with file upload, graded by an instructor (requirement 4.4). */
export interface Assignment {
  id: string;
  courseId: string;
  lessonId: string;
  title: string;
  task: "Task 1" | "Task 2";
  prompt: string;
  minWords: number;
  dueAt: string;
  maxScore: number; // band 9
  rubric: { criterion: string; description: string }[];
}

export interface Submission {
  id: string;
  assignmentId: string;
  userId: string;
  userName: string;
  fileName?: string;
  fileSize?: number;
  text: string;
  wordCount: number;
  submittedAt: string;
  late: boolean;
  status: "submitted" | "graded";
  scores?: Record<string, number>;
  band?: number;
  feedback?: string;
  gradedBy?: string;
  gradedAt?: string;
}

export interface LessonNote {
  userId: string;
  lessonId: string;
  text: string;
  updatedAt: string;
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
