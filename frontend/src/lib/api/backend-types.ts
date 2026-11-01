/**
 * Response shapes of the real Express backend, copied from `backend/src/docs/openapi.yaml`.
 * Keep these in sync with that file. The UI uses its own types in `@/lib/types`;
 * `mappers.ts` converts between the two.
 */

export type BackendRole = "learner" | "instructor" | "admin";

/** `User` schema: what `/auth/*`, `/me` and `/admin/users` return. */
export interface BackendUser {
  userId: number;
  email: string;
  fullName: string;
  role: BackendRole;
  targetBand: number | null;
  isActive: boolean;
  createdAt: string;
}

/** Body of every successful auth call: `POST /auth/register` and `POST /auth/login`. */
export interface BackendAuthResponse {
  user: BackendUser;
  token: string;
  message: string;
}

export type BackendSkillCategory = "listening" | "reading" | "writing" | "speaking";
export type BackendCourseLevel = "beginner" | "intermediate" | "advanced";
export type BackendCourseStatus = "draft" | "pending_review" | "approved" | "rejected" | "archived";

/** `Skill` schema: `GET /skills`. */
export interface BackendSkill {
  skillId: number;
  skillCode: string;
  name: string;
  category: BackendSkillCategory;
  description: string | null;
}

/** `SkillTag` schema: a skill on a lesson or question, with its weight. */
export interface BackendSkillTag {
  skillId: number;
  skillCode: string;
  name: string;
  weight: number;
}

/** `Course` schema. `isEnrolled` is only sent to learners. */
export interface BackendCourse {
  courseId: number;
  instructor: { userId: number; fullName: string };
  title: string;
  description: string | null;
  targetLevel: BackendCourseLevel;
  status: BackendCourseStatus;
  reviewFeedback: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  lessonCount: number;
  isEnrolled?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `Enrollment` schema: `GET /me/enrollments`, `POST /courses/:id/enroll`. */
export interface BackendEnrollment {
  course: BackendCourse;
  enrolledAt: string;
  completedAt: string | null;
  completedLessons: number;
  totalCoreLessons: number;
  progressPercent: number;
}

/** `LessonProgress` schema. */
export interface BackendLessonProgress {
  lessonId: number;
  status: "in_progress" | "completed";
  startedAt: string;
  completedAt: string | null;
}

/** `Lesson` schema: the items of `GET /courses/:id/lessons`. `progress` and `locked` are only sent to learners. */
export interface BackendLesson {
  lessonId: number;
  courseId: number;
  title: string;
  kind: "core" | "remedial";
  orderIndex: number;
  skills: BackendSkillTag[];
  progress?: BackendLessonProgress | null;
  locked?: boolean;
}

/** `Passage` schema: reading text, listening audio or video. */
export interface BackendPassage {
  passageId: number;
  lessonId: number | null;
  type: "reading_text" | "listening_audio" | "video";
  title: string | null;
  content: string | null;
  mediaPath: string | null;
  mediaUrl: string | null;
  orderIndex: number;
}

/** `QuizSummary` schema. */
export interface BackendQuizSummary {
  quizId: number;
  kind: "diagnostic" | "lesson" | "practice";
  title: string;
  questionCount: number;
  timeLimitSeconds: number | null;
}

/** `LessonDetail` schema: `GET /lessons/:id`. */
export interface BackendLessonDetail extends BackendLesson {
  content: string | null;
  passages: BackendPassage[];
  quizzes: BackendQuizSummary[];
}

/** `Attempt` schema. */
export interface BackendAttempt {
  attemptId: number;
  quizId: number;
  status: "in_progress" | "completed";
  startedAt: string;
  completedAt: string | null;
  totalScore: number | null;
  maxScore: number;
}

/** `AttemptSummary` schema: `GET /me/attempts`. */
export interface BackendAttemptSummary extends BackendAttempt {
  quiz: BackendQuizSummary;
}

export type BackendQuestionType = "multiple_choice" | "true_false_not_given" | "gap_fill" | "matching" | "error_identification";

/** One option of a multiple-choice question, or one item / choice of a matching question. */
export interface BackendChoiceOption {
  id: string;
  text: string;
}

/** `QuestionOptions`: a list for multiple choice, `{ items, choices }` for matching, null otherwise. */
export type BackendQuestionOptions = BackendChoiceOption[] | { items: BackendChoiceOption[]; choices: BackendChoiceOption[] } | null;

/** `Answer`: a string, or for matching an object of item id → choice id. */
export type BackendAnswer = string | Record<string, string>;

/** `AnswerKey`: an option id or true/false/not_given, the accepted gap-fill answers, or the matching map. */
export type BackendAnswerKey = string | string[] | Record<string, string>;

/** `QuestionForLearner` schema: no answer, explanation or skills. */
export interface BackendQuestionForLearner {
  questionId: number;
  passageId: number | null;
  questionType: BackendQuestionType;
  questionText: string;
  options: BackendQuestionOptions;
}

/** `Question` schema: the author view, with the answer. */
export interface BackendQuestion extends BackendQuestionForLearner {
  answerKey: BackendAnswerKey;
  explanation: string | null;
  difficulty: number;
  skills: BackendSkillTag[];
  createdById: number;
}

/** `QuizForLearner` schema. */
export interface BackendQuizForLearner extends BackendQuizSummary {
  lessonId: number | null;
  description: string | null;
  passages: BackendPassage[];
  questions: BackendQuestionForLearner[];
}

/** `Quiz` schema: the author view. */
export interface BackendQuiz extends BackendQuizSummary {
  lessonId: number | null;
  description: string | null;
  createdById: number;
  passages: BackendPassage[];
  questions: BackendQuestion[];
}

/** `ResponseResult` schema: one question of a graded attempt. */
export interface BackendResponseResult {
  questionId: number;
  questionText: string;
  questionType: BackendQuestionType;
  userAnswer: BackendAnswer | null;
  isCorrect: boolean;
  correctAnswer: BackendAnswerKey;
  explanation: string | null;
  attemptOrder: number | null;
  responseTimeSeconds: number | null;
  skills: BackendSkillTag[];
}

/** `MasteryChange` schema (Phase 3). */
export interface BackendMasteryChange {
  skillId: number;
  skillCode: string;
  name: string;
  before: number | null;
  after: number;
}

/** `AttemptResult` schema: `GET /attempts/:id` and `POST /attempts/:id/submit`. */
export interface BackendAttemptResult {
  attempt: BackendAttempt;
  quiz: BackendQuizSummary;
  scorePercent: number | null;
  responses: BackendResponseResult[];
  masteryChanges: BackendMasteryChange[];
  recommendations: BackendRecommendation[];
}

/** `Mastery` schema: `GET /me/mastery` (Phase 3, served by the Advanced service). */
export interface BackendMastery {
  skillId: number;
  skillCode: string;
  name: string;
  category: "listening" | "reading" | "writing" | "speaking";
  masteryProb: number;
  observations: number;
  updatedAt: string;
}

/** `Recommendation` schema: `GET /recommendations` (Phase 3). */
export interface BackendRecommendation {
  recommendationId: number;
  type: "lesson" | "quiz";
  lesson: { lessonId: number; title: string; courseId: number; courseTitle: string; isEnrolled: boolean } | null;
  quiz: { quizId: number; title: string } | null;
  skill: { skillId: number; skillCode: string; name: string };
  masteryProb: number;
  rank: number;
  score: number;
  rationale: string;
  createdAt: string;
  clickedAt: string | null;
}

/** `AdminStats` schema: `GET /admin/stats`. */
export interface BackendAdminStats {
  users: { total: number; active: number; inactive: number; byRole: Record<BackendRole, number> };
  courses: { total: number; byStatus: Record<BackendCourseStatus, number> };
  enrollments: number;
  attempts: { completed: number; completedLast7Days: number };
  activeLearnersLast7Days: number;
}

/** Error body for every 4xx/5xx: `{ error: { message, details? } }`. */
export interface BackendErrorBody {
  error?: {
    message?: string;
    details?: string[];
  };
}
