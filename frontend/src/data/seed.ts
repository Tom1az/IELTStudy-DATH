import type {
  AppNotification, Assignment, AuditLog, ContentReport, Course, DiscussionPost, Enrollment, Lesson,
  LessonNote, PracticeSet, Question, QuizAttempt, Skill, SkillCategory, Submission, UserRecord, UserSkillMastery,
} from "@/lib/types";
import { SKILLS } from "./skills";
import { TEMPLATES, type Template } from "./practice-content";
import { GUIDES } from "./lesson-guides";

export const SEED_PASSWORD = "Password123!";
/** sha256("seed-salt:Password123!") — the mock auth service hashes with the same scheme. */
const SEED_HASH = "sha256$seed-salt$1503639c51a5f1bfde0493229bdbf8140ccaa55ebbc9a0f4f63f3a87fb3cb10c";

export const SEED_NOW = Date.parse("2026-10-22T08:00:00+07:00");
const daysAgo = (d: number, h = 0) => new Date(SEED_NOW - d * 86400000 - h * 3600000).toISOString();
const daysAhead = (d: number, h = 0) => new Date(SEED_NOW + d * 86400000 + h * 3600000).toISOString();

export interface Db {
  version: number;
  users: UserRecord[];
  skills: Skill[];
  courses: Course[];
  lessons: Lesson[];
  practiceSets: PracticeSet[];
  attempts: QuizAttempt[];
  enrollments: Enrollment[];
  mastery: UserSkillMastery[];
  posts: DiscussionPost[];
  notifications: AppNotification[];
  reports: ContentReport[];
  audit: AuditLog[];
  assignments: Assignment[];
  submissions: Submission[];
  notes: LessonNote[];
  resetTokens: { email: string; token: string; expiresAt: string }[];
  recEvents: { id: string; userId: string; recId: string; targetId: string; action: "shown" | "clicked" | "helpful" | "not_helpful"; at: string }[];
}

export const DB_VERSION = 5;

/* ── deterministic PRNG so the seed is identical on every machine ── */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ────────────────────────── Courses & lessons ────────────────────────── */

type LessonDef = [title: string, minutes: number, template: string, skills: string[], practiceTitle?: string, shortTitle?: string, preview?: boolean];

const SKILL_ORDER: SkillCategory[] = ["listening", "reading", "writing", "speaking"];
const SKILL_LETTER: Record<SkillCategory, string> = { listening: "l", reading: "r", writing: "w", speaking: "s" };

const FOUNDATION: Record<SkillCategory, LessonDef[]> = {
  listening: [
    ["Understanding the Listening test format", 9, "L_FORM", ["L.SPELL", "L.FORM"], "Test format warm-up"],
    ["Spelling names and numbers", 10, "L_FORM", ["L.SPELL"], "Names and numbers", undefined, true],
    ["Form completion basics", 11, "L_FORM", ["L.FORM"], "Form completion"],
    ["Following directions on a map", 12, "L_MAP", ["L.MAP"], "Map directions"],
    ["Choosing the right option", 11, "L_MCQ", ["L.MCQ"], "Multiple choice"],
    ["Listening to short talks", 12, "L_LECT", ["L.LECT"], "Short talks"],
  ],
  reading: [
    ["The Reading test format", 9, "R_SKIM", ["R.SKIM"], "Reading warm-up"],
    ["Building academic vocabulary", 10, "R_SENT", ["R.PARA", "R.SENT"], "Vocabulary in context"],
    ["Finding the main idea", 11, "R_HEAD", ["R.HEAD", "R.SKIM"], "Main ideas"],
    ["Scanning for names and numbers", 10, "R_SKIM", ["R.SKIM"], "Scanning"],
    ["Introduction to True / False / Not Given", 12, "R_TFNG", ["R.TFNG", "R.PARA"], "True / False / Not Given", "Intro to T / F / NG", true],
    ["Short-answer and completion tasks", 11, "R_SENT", ["R.SENT"], "Completion tasks"],
  ],
  writing: [
    ["Task 1 and Task 2 explained", 10, "W_T1OV", ["W.T1OV", "W.T2"], "Writing test format"],
    ["Simple and complex sentences", 11, "W_GRAM", ["G.COND3", "V.COLL"], "Sentence accuracy"],
    ["Describing simple charts", 12, "W_T1", ["W.T1"], "Simple charts"],
    ["Writing an overview", 10, "W_T1OV", ["W.T1OV"], "Overview"],
    ["Essay structure: four paragraphs", 12, "W_T2", ["W.T2"], "Essay structure"],
    ["Linking words that work", 11, "W_T2", ["W.COH"], "Linking words"],
  ],
  speaking: [
    ["The Speaking test in three parts", 9, "S_P1", ["S.P1"], "Speaking format"],
    ["Talking about yourself", 10, "S_P1", ["S.P1"], "Talking about yourself", undefined, true],
    ["Everyday topics: home, work, study", 11, "S_P1", ["S.P1", "S.DM"], "Everyday topics"],
    ["Your first cue card", 12, "S_P2", ["S.P2"], "First cue card"],
    ["Sounding natural: stress basics", 10, "S_PRON", ["S.PRON"], "Stress basics"],
    ["Giving simple opinions", 11, "S_P3", ["S.P3"], "Simple opinions"],
  ],
};

const INTERMEDIATE: Record<SkillCategory, LessonDef[]> = {
  listening: [
    ["Section 1: Form and note completion", 11, "L_FORM", ["L.FORM", "L.SPELL"], "Form completion"],
    ["Section 2: Map and plan labelling", 12, "L_MAP", ["L.MAP"], "Map labelling"],
    ["Section 3: Multiple choice and distractors", 14, "L_MCQ", ["L.MCQ"], "Distractors"],
    ["Section 4: Lecture note completion", 13, "L_LECT", ["L.LECT"], "Lecture note completion"],
    ["Matching and classification", 12, "L_MCQ", ["L.MATCH", "L.MCQ"], "Matching"],
    ["Short-answer questions", 11, "L_FORM", ["L.FORM", "L.SPELL"], "Short answers"],
    ["Multiple choice under exam timing", 13, "L_MCQ", ["L.MCQ", "L.MATCH"], "Multiple choice"],
    ["Lecture notes under exam timing", 14, "L_LECT", ["L.LECT"], "Lecture notes"],
  ],
  reading: [
    ["Skimming and scanning for keywords", 10, "R_SKIM", ["R.SKIM"], "Skimming and scanning", "Skimming and scanning"],
    ["Sentence and summary completion", 12, "R_SENT", ["R.SENT", "R.PARA"], "Sentence completion"],
    ["True / False / Not Given", 14, "R_TFNG", ["R.TFNG", "R.PARA"], "True / False / Not Given", undefined, true],
    ["Matching headings", 12, "R_HEAD", ["R.HEAD"], "Matching headings"],
    ["Matching information", 11, "R_MINF", ["R.MINF"], "Matching information"],
    ["Multiple choice questions", 12, "R_MCQ", ["R.MCQ"], "Multiple choice"],
    ["Timing a full passage", 13, "R_SENT", ["R.SKIM", "R.SENT"], "Timed passage"],
    ["Reading review test", 15, "R_HEAD", ["R.HEAD", "R.TFNG"], "Review test"],
  ],
  writing: [
    ["Reading the Task 1 visual", 11, "W_T1OV", ["W.T1OV"], "Reading the visual"],
    ["Writing a clear overview", 12, "W_T1OV", ["W.T1OV", "W.COH"], "Overview"],
    ["Describing line graphs", 15, "W_T1", ["W.T1"], "Line graphs"],
    ["Bar charts and tables", 13, "W_T1", ["W.T1", "V.COLL"], "Bar charts and tables"],
    ["Task 2: question types and planning", 14, "W_T2", ["W.T2"], "Task 2 planning"],
    ["Building a body paragraph", 13, "W_T2", ["W.T2", "W.COH"], "Body paragraphs"],
    ["Grammar for Band 6.5", 12, "W_GRAM", ["G.COND3", "G.INV", "V.COLL"], "Grammar check"],
    ["A full Task 2 essay in 40 minutes", 16, "W_T2", ["W.T2", "W.COH", "G.INV"], "Full essay language"],
  ],
  speaking: [
    ["Part 1: extending short answers", 10, "S_P1", ["S.P1"], "Extending answers"],
    ["Part 1: familiar topics", 11, "S_P1", ["S.P1", "S.DM"], "Familiar topics"],
    ["Part 2: using the preparation minute", 12, "S_P2", ["S.P2"], "Preparation minute"],
    ["Part 2: telling a story with structure", 13, "S_P2", ["S.P2", "S.DM"], "Story structure"],
    ["Part 3: giving and supporting opinions", 12, "S_P3", ["S.P3"], "Supporting opinions"],
    ["Part 3: comparing and speculating", 13, "S_P3", ["S.P3", "S.DM"], "Comparing and speculating"],
    ["Pronunciation: word and sentence stress", 11, "S_PRON", ["S.PRON"], "Word and sentence stress"],
    ["Speaking mock test", 15, "S_P3", ["S.P1", "S.P2", "S.P3"], "Mock test"],
  ],
};

const ADVANCED: Record<SkillCategory, LessonDef[]> = {
  listening: [
    ["Section 1 at speed: avoiding spelling slips", 11, "L_FORM", ["L.SPELL", "L.FORM"], "Spelling at speed"],
    ["Complex plans and diagrams", 13, "L_MAP", ["L.MAP"], "Complex plans"],
    ["Attitude and opinion in Section 3", 14, "L_MCQ", ["L.MCQ", "L.MATCH"], "Attitude and opinion"],
    ["Dense lectures: note-taking shortcuts", 15, "L_LECT", ["L.LECT"], "Dense lectures"],
    ["Matching speakers to views", 13, "L_MCQ", ["L.MATCH"], "Speakers and views"],
    ["Paraphrase traps in Section 4", 14, "L_LECT", ["L.LECT", "L.MCQ"], "Paraphrase traps"],
    ["Full test: Sections 1–2", 18, "L_MAP", ["L.FORM", "L.MAP"], "Sections 1–2"],
    ["Full test: Sections 3–4", 18, "L_LECT", ["L.MCQ", "L.LECT"], "Sections 3–4"],
  ],
  reading: [
    ["Reading for the writer's view", 12, "R_TFNG", ["R.TFNG", "R.PARA"], "Writer's view"],
    ["Yes / No / Not Given vs True / False / Not Given", 13, "R_TFNG", ["R.TFNG"], "Y / N / NG", "Y / N / NG vs T / F / NG"],
    ["Advanced matching headings", 13, "R_HEAD", ["R.HEAD"], "Advanced headings", undefined, true],
    ["Summary completion with a word bank", 12, "R_SENT", ["R.SENT", "R.PARA"], "Summary completion"],
    ["Matching features and information", 12, "R_MINF", ["R.MINF"], "Matching features"],
    ["Hard multiple choice", 13, "R_MCQ", ["R.MCQ", "R.PARA"], "Hard multiple choice"],
    ["Managing 60 minutes for three passages", 14, "R_SKIM", ["R.SKIM", "R.SENT"], "Time management"],
    ["Full Academic Reading test", 20, "R_MCQ", ["R.MCQ", "R.TFNG", "R.HEAD"], "Full test"],
  ],
  writing: [
    ["Task 1: maps and processes", 14, "W_T1OV", ["W.T1OV"], "Maps and processes"],
    ["Task 1: mixed charts", 14, "W_T1", ["W.T1"], "Mixed charts"],
    ["Precise data language", 12, "W_T1", ["W.T1", "V.COLL"], "Data language"],
    ["Task 2: developing complex arguments", 15, "W_T2", ["W.T2", "W.COH"], "Complex arguments"],
    ["Inversion and conditionals for emphasis", 13, "W_GRAM", ["G.INV", "G.COND3"], "Inversion and conditionals"],
    ["Collocation and register", 12, "W_GRAM", ["V.COLL"], "Collocation"],
    ["Editing for Band 7+ accuracy", 13, "W_GRAM", ["G.COND3", "G.INV", "V.COLL"], "Editing"],
    ["Timed Task 1 + Task 2", 18, "W_T2", ["W.T2", "W.T1"], "Timed writing language"],
  ],
  speaking: [
    ["Part 1 with natural idioms", 11, "S_P1", ["S.P1", "S.DM"], "Natural idioms"],
    ["Part 2: vivid description", 13, "S_P2", ["S.P2"], "Vivid description"],
    ["Part 2: handling unfamiliar cue cards", 12, "S_P2", ["S.P2", "S.DM"], "Unfamiliar cue cards"],
    ["Part 3: abstract and hypothetical questions", 14, "S_P3", ["S.P3"], "Abstract questions"],
    ["Hedging and qualifying opinions", 12, "S_P3", ["S.P3", "S.DM"], "Hedging"],
    ["Intonation and chunking", 12, "S_PRON", ["S.PRON"], "Intonation"],
    ["Self-correction without losing fluency", 11, "S_P1", ["S.P1", "S.DM"], "Self-correction"],
    ["Full Speaking mock test", 15, "S_P3", ["S.P1", "S.P2", "S.P3"], "Full mock test"],
  ],
};

interface CourseSpec {
  key: string;
  course: Omit<Course, "createdAt" | "updatedAt">;
  lessons: Partial<Record<SkillCategory, LessonDef[]>>;
}

const COURSE_SPECS: CourseSpec[] = [
  {
    key: "fdn",
    lessons: FOUNDATION,
    course: {
      id: "c-foundation", slug: "foundation", level: 1, levelName: "Foundation", title: "IELTS Foundation", bandRange: "Band 4.0 – 5.0",
      tagline: "Learn core vocabulary, everyday grammar and the format of every IELTS task.",
      catalogBlurb: "Learn core vocabulary, everyday grammar and the format of every IELTS task before you start timing yourself.",
      instructorId: "u-inst-1", status: "published", prerequisiteText: "No prerequisite", hours: 18,
      outcomes: [
        "Know the format and timing of all four IELTS papers",
        "Recognise every Listening and Reading question type",
        "Write simple, accurate Task 1 and Task 2 paragraphs",
        "Answer Part 1 Speaking questions with confidence",
      ],
      includes: ["24 video lessons across 4 skills", "24 IELTS-style practice sets with explanations", "Slides and vocabulary lists to download", "Progress tracking by skill", "Discussion board for every lesson"],
    },
  },
  {
    key: "int",
    lessons: INTERMEDIATE,
    course: {
      id: "c-intermediate", slug: "intermediate", level: 2, levelName: "Intermediate", title: "IELTS Intermediate", bandRange: "Band 5.5 – 6.5",
      tagline: "Master each question type, plan longer answers and stop losing marks to common traps.",
      catalogBlurb: "Master each question type, plan longer answers and stop losing marks to common traps in all four skills.",
      instructorId: "u-inst-1", status: "published", prerequisiteText: "Level 1 or a placement score of 5.0+", prerequisiteBand: 5.0, hours: 26,
      outcomes: [
        "Answer every Listening and Reading question type with a repeatable method",
        "Spot distractors, paraphrase and keyword traps",
        "Plan and write Task 1 reports and Task 2 essays in 20 and 40 minutes",
        "Speak fluently on Part 1, 2 and 3 topics with clear structure",
      ],
      includes: ["32 video lessons across 4 skills", "32 IELTS-style practice sets with explanations", "Slides and vocabulary lists to download", "Progress tracking by skill", "Discussion board for every lesson"],
    },
  },
  {
    key: "adv",
    lessons: ADVANCED,
    course: {
      id: "c-advanced", slug: "advanced", level: 3, levelName: "Advanced", title: "IELTS Advanced", bandRange: "Band 7.0 and above",
      tagline: "Refine accuracy, range and timing with test-level material and detailed feedback.",
      catalogBlurb: "Refine accuracy, range and timing with test-level material, model answers and detailed feedback.",
      instructorId: "u-inst-2", status: "published", prerequisiteText: "Level 2 or a placement score of 6.5+", prerequisiteBand: 6.5, hours: 26,
      outcomes: [
        "Work through full Academic papers under real timing",
        "Handle writer's-view and attitude questions accurately",
        "Use inversion, conditionals and collocation naturally in writing",
        "Discuss abstract Part 3 topics with hedging and nuance",
      ],
      includes: ["32 video lessons across 4 skills", "32 IELTS-style practice sets with explanations", "Model answers for every writing task", "Progress tracking by skill", "Discussion board for every lesson"],
    },
  },
  {
    key: "gtw",
    lessons: {
      writing: [
        ["General Training Task 1: letters", 12, "W_T1OV", ["W.T1OV", "W.COH"], "Letter language"],
        ["Formal, semi-formal and informal tone", 11, "W_GRAM", ["V.COLL"], "Tone and register"],
        ["Task 2 for General Training", 13, "W_T2", ["W.T2"], "GT essay language"],
      ],
    },
    course: {
      id: "c-gt-writing", slug: "gt-writing-booster", level: 2, levelName: "Writing Booster", title: "General Training Writing Booster", bandRange: "Band 5.5 – 6.5",
      tagline: "Letters and essays for the General Training module.",
      catalogBlurb: "A short add-on course for General Training candidates: formal, semi-formal and informal letters plus Task 2 essays.",
      instructorId: "u-inst-2", status: "pending", prerequisiteText: "Level 1 or a placement score of 5.0+", prerequisiteBand: 5.0, hours: 6,
      outcomes: ["Write all three letter types with the right tone", "Plan a General Training essay in five minutes"],
      includes: ["3 video lessons", "3 practice sets with explanations", "Letter templates to download"],
      submittedAt: daysAgo(1, 3),
    },
  },
];

function instantiateQuestions(setId: string, t: Template): Question[] {
  return t.questions.map((q, i) => ({ ...q, id: `${setId}-q${i + 1}`, passageId: setId }));
}

function resourcesFor(template: string, lessonId: string, title: string) {
  const res = [
    { id: `${lessonId}-slides`, title: "Lesson slides (PDF)", meta: `${template === "R_TFNG" ? 14 : 9 + (title.length % 6)} pages`, kind: "slides" as const },
    { id: `${lessonId}-vocab`, title: "Vocabulary list", meta: "30 words · PDF", kind: "pdf" as const },
  ];
  if (template === "R_TFNG") res.push({ id: `${lessonId}-checklist`, title: "Answer-decision checklist", meta: "1 page · PDF", kind: "pdf" as const });
  else res.push({ id: `${lessonId}-checklist`, title: "Strategy checklist", meta: "1 page · PDF", kind: "pdf" as const });
  return res;
}

function transcriptFor(def: LessonDef, guide = GUIDES[def[2]]) {
  const [title] = def;
  return [
    `Hello and welcome to this lesson on ${title.toLowerCase()}.`,
    guide.body,
    "Let's start with the key strategy.",
    ...guide.strategy.map((s, i) => `Step ${i + 1}. ${s}`),
    guide.example ? `Here is a worked example. ${guide.example.quote} ${guide.example.items.map((it) => `${it.tag}: ${it.statement} ${it.explanation}`).join(" ")}` : "",
    "When you are ready, mark the lesson complete and try the practice set straight away while the method is fresh.",
  ].filter(Boolean).join("\n\n");
}

function buildCourses() {
  const courses: Course[] = [];
  const lessons: Lesson[] = [];
  const practiceSets: PracticeSet[] = [];
  for (const spec of COURSE_SPECS) {
    courses.push({ ...spec.course, createdAt: daysAgo(120), updatedAt: daysAgo(spec.course.status === "pending" ? 1 : 14) });
    for (const skill of SKILL_ORDER) {
      const defs = spec.lessons[skill];
      if (!defs) continue;
      defs.forEach((def, i) => {
        const [title, minutes, templateKey, skillIds, practiceTitle, shortTitle, preview] = def;
        const order = i + 1;
        const lessonId = `${spec.key}-${SKILL_LETTER[skill]}${order}`;
        const setId = `ps-${lessonId}`;
        const t = TEMPLATES[templateKey];
        const guide = GUIDES[templateKey];
        lessons.push({
          id: lessonId, courseId: spec.course.id, skill, order, title, shortTitle, videoMinutes: minutes,
          freePreview: !!preview, status: "published", skillIds, strategy: guide.strategy, workedExample: guide.example,
          bodyText: guide.body, transcript: transcriptFor(def), resources: resourcesFor(templateKey, lessonId, title),
          practiceSetId: setId, updatedAt: daysAgo(20 - (order % 5)),
        });
        const qs = instantiateQuestions(setId, t);
        const minutesForSet = templateKey === "R_TFNG" ? 12 : Math.max(8, Math.round(qs.length * 1.4));
        practiceSets.push({
          id: setId, code: `${SKILL_ORDER.indexOf(skill) + 1}.${order}`, courseId: spec.course.id, lessonId, skill,
          title: practiceTitle ?? title, minutes: minutesForSet, passage: t.passage, questions: qs, status: "published",
        });
      });
    }
  }
  return { courses, lessons, practiceSets };
}

/** 30-question diagnostic placement test (proposal §3): 8 L + 8 R + 7 W + 7 S. */
function buildPlacement(): PracticeSet[] {
  const make = (skill: SkillCategory, code: string, title: string, t: Template, take: number[], minutes: number, extraParagraphs: { text: string }[] = []): PracticeSet => {
    const id = `placement-${SKILL_LETTER[skill]}`;
    const qs = take.map((idx, i) => {
      const src = t.questions[idx];
      return { ...src, id: `${id}-q${i + 1}`, passageId: id, groupLabel: undefined, groupInstruction: src.groupInstruction };
    });
    return { id, code, courseId: null, lessonId: null, skill, title, minutes, passage: { ...t.passage, paragraphs: [...t.passage.paragraphs, ...extraParagraphs] }, questions: qs, status: "published" };
  };
  const sP1 = TEMPLATES.S_P1;
  const sPron = TEMPLATES.S_PRON;
  const speaking: PracticeSet = {
    id: "placement-s", code: "P.4", courseId: null, lessonId: null, skill: "speaking", title: "Speaking", minutes: 3, status: "published",
    passage: { kind: "speaking", title: "Speaking: fluency and pronunciation", paragraphs: [sP1.passage.paragraphs[1], sPron.passage.paragraphs[0]], audioScript: sPron.passage.audioScript },
    questions: [
      ...[0, 2, 4].map((i, k) => ({ ...sP1.questions[i], groupLabel: undefined, id: `placement-s-q${k + 1}`, passageId: "placement-s" })),
      ...[0, 1, 2, 3].map((i, k) => ({ ...sPron.questions[i], groupLabel: undefined, id: `placement-s-q${k + 4}`, passageId: "placement-s" })),
    ],
  };
  return [
    make("listening", "P.1", "Listening", TEMPLATES.L_LECT, [0, 1, 2, 3, 5, 6, 7, 9], 4),
    make("reading", "P.2", "Reading", TEMPLATES.R_HEAD, [0, 1, 2, 3, 4, 5, 6, 7], 5),
    make("writing", "P.3", "Writing", TEMPLATES.W_T2, [0, 1, 2, 3, 4, 5, 6], 3),
    speaking,
  ];
}

/* ────────────────────────── Users ────────────────────────── */

const basePrefs = { newContent: true, deadlines: true, results: true, email: false };

function user(u: Partial<UserRecord> & Pick<UserRecord, "id" | "email" | "name" | "role">): UserRecord {
  return {
    status: "active", targetBand: 7, createdAt: daysAgo(90), placementDone: u.role !== "learner" ? true : false,
    notificationPrefs: { ...basePrefs }, passwordHash: SEED_HASH, ...u,
  } as UserRecord;
}

const EXTRA_LEARNERS: [string, string, number, 1 | 2 | 3][] = [
  ["Bao Tran", "bao.tran", 0.28, 1],
  ["Linh Pham", "linh.pham", 0.74, 3],
  ["Quang Nguyen", "quang.nguyen", 0.46, 2],
  ["Thu Le", "thu.le", 0.52, 2],
  ["Daniel Kim", "daniel.kim", 0.61, 2],
  ["Ngoc Vo", "ngoc.vo", 0.35, 1],
  ["Hieu Dang", "hieu.dang", 0.43, 2],
  ["Sara Ahmed", "sara.ahmed", 0.69, 3],
  ["Khoa Bui", "khoa.bui", 0.31, 1],
  ["An Ho", "an.ho", 0.57, 2],
  ["Mai Truong", "mai.truong", 0.49, 2],
  ["Tuan Phan", "tuan.phan", 0.38, 1],
  ["Yuki Tanaka", "yuki.tanaka", 0.66, 2],
  ["Phuc Do", "phuc.do", 0.41, 2],
];

/* ────────────────────────── Build ────────────────────────── */

export function buildSeed(): Db {
  const rnd = mulberry32(261);
  const { courses, lessons, practiceSets } = buildCourses();
  practiceSets.push(...buildPlacement());

  const users: UserRecord[] = [
    user({ id: "u-learner", email: "learner@ieltstudy.dev", name: "Mira Evans", role: "learner", targetBand: 7, placementDone: true, placementBand: 5.0, recommendedLevel: 2, createdAt: daysAgo(75), lastActiveAt: daysAgo(0, 2), bio: "Preparing for IELTS Academic to apply for a master's in the UK." }),
    user({ id: "u-inst-1", email: "instructor@ieltstudy.dev", name: "Hannah Cole", role: "instructor", createdAt: daysAgo(200), lastActiveAt: daysAgo(0, 5), bio: "CELTA-qualified teacher, former IELTS examiner, 9 years of test-prep experience." }),
    user({ id: "u-inst-2", email: "long.nguyen@ieltstudy.dev", name: "Long Nguyen", role: "instructor", createdAt: daysAgo(160), lastActiveAt: daysAgo(1), bio: "Band 8.5 instructor specialising in Writing and Speaking." }),
    user({ id: "u-admin", email: "admin@ieltstudy.dev", name: "Admin Kim", role: "admin", createdAt: daysAgo(220), lastActiveAt: daysAgo(0, 1) }),
  ];

  const enrollments: Enrollment[] = [];
  const attempts: QuizAttempt[] = [];
  const mastery: UserSkillMastery[] = [];
  const setById = Object.fromEntries(practiceSets.map((s) => [s.id, s]));
  const lessonsOf = (courseId: string) => lessons.filter((l) => l.courseId === courseId);

  const makeAttempt = (userId: string, setId: string, correct: number, at: string, seedOffset = 0): QuizAttempt => {
    const set = setById[setId];
    const r = mulberry32(setId.length * 97 + correct * 13 + seedOffset);
    const n = set.questions.length;
    // harder questions are more likely to be the ones answered wrongly
    const wrong = new Set(set.questions.map((q, i) => ({ i, k: q.difficulty + r() * 2.2 })).sort((a, b) => b.k - a.k).slice(0, n - correct).map((x) => x.i));
    const responses = set.questions.map((q, i) => {
      const ok = !wrong.has(i);
      let ans = q.answerKey.split("|")[0];
      if (!ok) {
        if (q.type === "tfng") ans = ["TRUE", "FALSE", "NOT GIVEN"].find((x) => x !== q.answerKey)!;
        else if (q.type === "gap") ans = "—";
        else ans = String((Number(q.answerKey) + 1) % (q.options?.length ?? 4));
      }
      return { questionId: q.id, userAnswer: ans, isCorrect: ok, attemptOrder: i + 1, responseTimeSeconds: 30 + Math.floor(r() * 60) };
    });
    const end = Date.parse(at);
    return {
      id: `att-${userId}-${setId}-${seedOffset}`, userId, quizId: setId, kind: setId.startsWith("placement") ? "placement" : "practice", status: "submitted",
      answers: Object.fromEntries(responses.map((x) => [x.questionId, x.userAnswer])), totalScore: correct, maxScore: n,
      startedAt: new Date(end - set.minutes * 50000).toISOString(), completedAt: at, responses,
    };
  };

  /* Mira Evans — reproduces the Figma "My learning" screen exactly. */
  const fdnLessons = lessonsOf("c-foundation");
  enrollments.push({ id: "enr-mira-fdn", userId: "u-learner", courseId: "c-foundation", status: "completed", enrolledAt: daysAgo(70), completedAt: daysAgo(30), completedLessonIds: fdnLessons.map((l) => l.id), lastLessonId: "fdn-s6" });
  const intDone = ["int-l1", "int-l2", "int-l3", "int-l4", "int-l5", "int-l6", "int-l7", "int-l8", "int-r1", "int-r2", "int-w1", "int-w2"];
  enrollments.push({ id: "enr-mira-int", userId: "u-learner", courseId: "c-intermediate", status: "active", enrolledAt: daysAgo(28), completedLessonIds: intDone, lastLessonId: "int-r3", lastPositionSeconds: { "int-r3": 0 } });

  attempts.push(makeAttempt("u-learner", "placement-l", 4, daysAgo(75)), makeAttempt("u-learner", "placement-r", 4, daysAgo(75)), makeAttempt("u-learner", "placement-w", 3, daysAgo(75)), makeAttempt("u-learner", "placement-s", 4, daysAgo(75)));
  fdnLessons.forEach((l, i) => {
    const set = setById[l.practiceSetId];
    attempts.push(makeAttempt("u-learner", set.id, Math.max(3, set.questions.length - 1 - (i % 3)), daysAgo(68 - i * 1.5)));
  });
  [["int-l1", 8], ["int-l2", 7], ["int-l3", 6], ["int-l4", 8], ["int-l5", 6], ["int-l6", 8]].forEach(([lid, c], i) =>
    attempts.push(makeAttempt("u-learner", `ps-${lid}`, c as number, daysAgo(14 - i))),
  );
  attempts.push(makeAttempt("u-learner", "ps-int-w1", 4, daysAgo(5)), makeAttempt("u-learner", "ps-int-w2", 3, daysAgo(4, 4)));
  // Recent practice results in the Figma (order: newest first)
  attempts.push(makeAttempt("u-learner", "ps-int-r1", 6, daysAgo(4)));
  attempts.push(makeAttempt("u-learner", "ps-int-l7", 7, daysAgo(3)));
  attempts.push(makeAttempt("u-learner", "ps-int-l8", 9, daysAgo(2)));
  attempts.push(makeAttempt("u-learner", "ps-int-r2", 8, daysAgo(1)));
  // In-progress attempt on Practice set 2.3 — the Figma practice screen (4 of 6 answered, 12:48 left)
  attempts.push({
    id: "att-mira-int-r3-live", userId: "u-learner", quizId: "ps-int-r3", kind: "practice", status: "in_progress",
    answers: { "ps-int-r3-q1": "NOT GIVEN", "ps-int-r3-q2": "FALSE", "ps-int-r3-q3": "TRUE", "ps-int-r3-q5": "1" },
    remainingSeconds: 768, totalScore: 0, maxScore: 6, startedAt: daysAgo(0, 1), responses: [],
  });

  const MIRA: Record<string, number> = {
    "L.SPELL": 0.72, "L.FORM": 0.7, "L.MAP": 0.66, "L.MCQ": 0.52, "L.MATCH": 0.48, "L.LECT": 0.52,
    "R.SKIM": 0.68, "R.PARA": 0.55, "R.SENT": 0.62, "R.TFNG": 0.38, "R.HEAD": 0.45, "R.MINF": 0.4, "R.MCQ": 0.42,
    "W.T1OV": 0.58, "W.T1": 0.4, "W.T2": 0.42, "W.COH": 0.45, "G.COND3": 0.35, "G.INV": 0.22, "V.COLL": 0.38,
    "S.P1": 0.62, "S.DM": 0.55, "S.P2": 0.48, "S.P3": 0.4, "S.PRON": 0.45,
  };
  for (const [skillId, p] of Object.entries(MIRA)) mastery.push({ userId: "u-learner", skillId, masteryProb: p, attempts: 6 + Math.round(p * 10), updatedAt: daysAgo(1) });

  /* Other learners: deterministic profiles for analytics, instructor and admin screens. */
  EXTRA_LEARNERS.forEach(([name, handle, ability, level], idx) => {
    const id = `u-l${idx + 2}`;
    const band = Math.round((3 + 5 * ability) * 2) / 2;
    users.push(user({
      id, email: `${handle}@example.edu.vn`, name, role: "learner", targetBand: Math.min(8, band + 1.5), placementDone: true, placementBand: band,
      recommendedLevel: level, createdAt: daysAgo(80 - idx * 4), lastActiveAt: daysAgo(idx % 5 === 0 ? 12 + idx : idx % 4, idx),
      status: idx === 11 ? "suspended" : "active",
    }));
    for (const s of SKILLS) {
      const p = Math.max(0.05, Math.min(0.97, ability + (rnd() - 0.5) * 0.3));
      mastery.push({ userId: id, skillId: s.id, masteryProb: Math.round(p * 100) / 100, attempts: 3 + Math.floor(rnd() * 12), updatedAt: daysAgo(Math.floor(rnd() * 10)) });
    }
    const course = courses.find((c) => c.level === level && c.status === "published")!;
    const ls = lessonsOf(course.id);
    const stalled = idx % 5 === 0;
    const doneCount = stalled ? Math.floor(ls.length * 0.12) : Math.floor(ls.length * (0.2 + rnd() * 0.75));
    const done = ls.slice(0, doneCount).map((l) => l.id);
    enrollments.push({
      id: `enr-${id}`, userId: id, courseId: course.id, status: done.length === ls.length ? "completed" : "active",
      enrolledAt: daysAgo(60 - idx * 2), completedAt: done.length === ls.length ? daysAgo(3) : undefined, completedLessonIds: done, lastLessonId: done[done.length - 1],
    });
    if (level > 1) {
      const prev = courses.find((c) => c.level === level - 1)!;
      enrollments.push({ id: `enr-${id}-prev`, userId: id, courseId: prev.id, status: "completed", enrolledAt: daysAgo(100), completedAt: daysAgo(62), completedLessonIds: lessonsOf(prev.id).map((l) => l.id) });
    }
    done.slice(0, 10).forEach((lid, k) => {
      const set = setById[`ps-${lid}`];
      const c = Math.max(1, Math.min(set.questions.length, Math.round(set.questions.length * (ability + (rnd() - 0.4) * 0.3))));
      attempts.push(makeAttempt(id, set.id, c, daysAgo(40 - k * 3 - (idx % 3)), idx));
    });
  });

  /* Assignments (file-submission writing tasks) */
  const assignments: Assignment[] = [
    {
      id: "asg-int-w3", courseId: "c-intermediate", lessonId: "int-w3", title: "Task 1 report: cinema visits line graph", task: "Task 1", minWords: 150, dueAt: daysAhead(4, -6), maxScore: 9,
      prompt: "The line graph shows the average number of cinema visits per person per year in three countries between 2000 and 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.",
      rubric: [
        { criterion: "Task Achievement", description: "Clear overview, key features selected and supported with data." },
        { criterion: "Coherence & Cohesion", description: "Logical organisation, paragraphing and linking." },
        { criterion: "Lexical Resource", description: "Range and accuracy of trend vocabulary." },
        { criterion: "Grammatical Range & Accuracy", description: "Variety and accuracy of structures." },
      ],
    },
    {
      id: "asg-int-w8", courseId: "c-intermediate", lessonId: "int-w8", title: "Task 2 essay: free university education", task: "Task 2", minWords: 250, dueAt: daysAhead(18), maxScore: 9,
      prompt: "Some people believe that university education should be free for everyone. To what extent do you agree or disagree? Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words.",
      rubric: [
        { criterion: "Task Response", description: "Clear position developed throughout with relevant support." },
        { criterion: "Coherence & Cohesion", description: "Logical progression and clear paragraphing." },
        { criterion: "Lexical Resource", description: "Range, precision and collocation." },
        { criterion: "Grammatical Range & Accuracy", description: "Complex structures used accurately." },
      ],
    },
    {
      id: "asg-fdn-w5", courseId: "c-foundation", lessonId: "fdn-w5", title: "Four-paragraph essay: working from home", task: "Task 2", minWords: 250, dueAt: daysAgo(35), maxScore: 9,
      prompt: "More people now work from home. Do the advantages of this outweigh the disadvantages? Write at least 250 words.",
      rubric: [
        { criterion: "Task Response", description: "Answers the question with a clear position." },
        { criterion: "Coherence & Cohesion", description: "Four clear paragraphs." },
        { criterion: "Lexical Resource", description: "Appropriate vocabulary." },
        { criterion: "Grammatical Range & Accuracy", description: "Mostly accurate sentences." },
      ],
    },
  ];

  const sampleEssay = "The graph illustrates how often people in three countries went to the cinema between 2000 and 2020. Overall, cinema-going became more popular in Countries A and C, whereas it declined steadily in Country B, which moved from the highest to the lowest figure.\n\nIn 2000, people in Country B visited cinemas four times a year on average, double the figure for Country A. However, this number fell to 2.5 in 2010 and to just 1.5 by 2020. By contrast, visits in Country A rose sharply to 3.5 in 2010 and then levelled off.\n\nCountry C showed a different pattern. Its figure stayed at around one visit per person until 2010, but then almost tripled, reaching 3.0 in 2020, slightly lower than Country A.";
  const submissions: Submission[] = [
    { id: "sub-1", assignmentId: "asg-int-w3", userId: "u-l5", userName: "Thu Le", fileName: "thu-le-task1.docx", fileSize: 18432, text: sampleEssay, wordCount: 152, submittedAt: daysAgo(1, 4), late: false, status: "submitted" },
    { id: "sub-2", assignmentId: "asg-int-w3", userId: "u-l6", userName: "Daniel Kim", fileName: "task1_cinema.pdf", fileSize: 40211, text: sampleEssay.replace("Overall,", "In general,"), wordCount: 150, submittedAt: daysAgo(2), late: false, status: "submitted" },
    { id: "sub-3", assignmentId: "asg-int-w3", userId: "u-l4", userName: "Quang Nguyen", fileName: "quang-task1.docx", fileSize: 15120, text: "The graph shows cinema visits. Country A go up from 2 to 3.5 and then same. Country B go down a lot. Country C is same then go up. In conclusion cinema is popular.", wordCount: 38, submittedAt: daysAgo(3), late: false, status: "graded", scores: { "Task Achievement": 4, "Coherence & Cohesion": 4.5, "Lexical Resource": 4.5, "Grammatical Range & Accuracy": 4 }, band: 4.5, feedback: "Your answer is far below 150 words and has no clear overview. Add an 'Overall,' sentence and support each trend with figures. Check subject–verb agreement (Country A goes up).", gradedBy: "u-inst-1", gradedAt: daysAgo(2) },
    { id: "sub-4", assignmentId: "asg-fdn-w5", userId: "u-learner", userName: "Mira Evans", fileName: "mira-wfh-essay.docx", fileSize: 21504, text: "Working from home has become common in many countries. In my opinion, the advantages outweigh the disadvantages...", wordCount: 268, submittedAt: daysAgo(37), late: false, status: "graded", scores: { "Task Response": 5.5, "Coherence & Cohesion": 5.5, "Lexical Resource": 5, "Grammatical Range & Accuracy": 5 }, band: 5.5, feedback: "Clear position and good paragraphing. To reach Band 6, develop each main idea with a specific example and vary your sentence openings.", gradedBy: "u-inst-1", gradedAt: daysAgo(33) },
  ];

  const posts: DiscussionPost[] = [
    { id: "post-1", lessonId: "int-r3", userId: "u-l5", authorName: "Thu Le", authorRole: "learner", body: "How do I tell FALSE from NOT GIVEN when the passage only mentions part of the statement?", createdAt: daysAgo(3, 5) },
    { id: "post-2", lessonId: "int-r3", userId: "u-inst-1", authorName: "Hannah Cole", authorRole: "instructor", parentId: "post-1", body: "Ask yourself: does the writer say the opposite? If yes, it's FALSE. If the writer simply doesn't comment on that part, it's NOT GIVEN. Partial information is the classic NOT GIVEN trap.", createdAt: daysAgo(3, 2) },
    { id: "post-3", lessonId: "int-r3", userId: "u-l6", authorName: "Daniel Kim", authorRole: "learner", body: "The tip about qualifying words (always / some / most) helped me get question 2 right. Thanks!", createdAt: daysAgo(1, 8) },
    { id: "post-4", lessonId: "int-l3", userId: "u-l4", authorName: "Quang Nguyen", authorRole: "learner", body: "Buy cheap IELTS certificates — message me on Telegram!!!", createdAt: daysAgo(2, 1) },
    { id: "post-5", lessonId: "int-l3", userId: "u-l9", authorName: "Sara Ahmed", authorRole: "learner", body: "Section 3 distractors are so sneaky. Listening for 'actually' really works.", createdAt: daysAgo(5) },
  ];

  const notifications: AppNotification[] = [
    { id: "n-1", userId: "u-learner", type: "result", title: "Practice set 2.2 scored", body: "You scored 8 / 10 on Sentence completion. Your Reading estimate is now 5.5.", link: "/my-learning/history", read: false, createdAt: daysAgo(1) },
    { id: "n-2", userId: "u-learner", type: "deadline", title: "Writing task due in 4 days", body: "Task 1 report: cinema visits line graph is due on Sunday.", link: "/assignments/asg-int-w3", read: false, createdAt: daysAgo(0, 3) },
    { id: "n-3", userId: "u-learner", type: "new_content", title: "New lesson resources", body: "Hannah Cole added an answer-decision checklist to True / False / Not Given.", link: "/learn/intermediate/int-r3", read: false, createdAt: daysAgo(2) },
    { id: "n-4", userId: "u-learner", type: "review", title: "Hannah Cole replied in a discussion", body: "A new reply was posted on True / False / Not Given.", link: "/learn/intermediate/int-r3?tab=discussion", read: true, createdAt: daysAgo(3) },
    { id: "n-5", userId: "u-learner", type: "result", title: "Essay graded: Band 5.5", body: "Your Foundation essay was graded with feedback.", link: "/assignments/asg-fdn-w5", read: true, createdAt: daysAgo(33) },
    { id: "n-6", userId: "u-inst-1", type: "system", title: "2 writing submissions to grade", body: "Task 1 report: cinema visits line graph has new submissions.", link: "/instructor/grading", read: false, createdAt: daysAgo(1) },
    { id: "n-7", userId: "u-inst-2", type: "review", title: "Course submitted for review", body: "General Training Writing Booster is waiting for admin approval.", link: "/instructor/courses/c-gt-writing", read: false, createdAt: daysAgo(1, 3) },
    { id: "n-8", userId: "u-admin", type: "review", title: "1 course awaiting review", body: "General Training Writing Booster was submitted by Long Nguyen.", link: "/admin/courses", read: false, createdAt: daysAgo(1, 3) },
    { id: "n-9", userId: "u-admin", type: "system", title: "2 open content reports", body: "A discussion post and a question were reported.", link: "/admin/reports", read: false, createdAt: daysAgo(1) },
  ];

  const reports: ContentReport[] = [
    { id: "rep-1", targetType: "post", targetId: "post-4", targetPreview: "Buy cheap IELTS certificates — message me on Telegram!!!", reason: "Spam or advertising", reporterId: "u-l9", reporterName: "Sara Ahmed", status: "open", createdAt: daysAgo(2) },
    { id: "rep-2", targetType: "question", targetId: "ps-int-r2-q3", targetPreview: "Researchers call the mismatch between body clock and timetable social ___.", reason: "Answer key seems wrong", details: "I wrote 'jetlag' as one word and it was marked wrong.", reporterId: "u-learner", reporterName: "Mira Evans", status: "open", createdAt: daysAgo(1) },
    { id: "rep-3", targetType: "post", targetId: "post-5", targetPreview: "Section 3 distractors are so sneaky…", reason: "Off-topic", reporterId: "u-l4", reporterName: "Quang Nguyen", status: "dismissed", createdAt: daysAgo(6), resolvedBy: "Admin Kim", resolution: "Post is on-topic." },
  ];

  const audit: AuditLog[] = [
    { id: "aud-1", actorId: "u-admin", actorName: "Admin Kim", action: "user.suspend", target: "Tuan Phan (tuan.phan@example.edu.vn)", detail: "Repeated spam in discussions", createdAt: daysAgo(6) },
    { id: "aud-2", actorId: "u-admin", actorName: "Admin Kim", action: "report.dismiss", target: "Report rep-3", detail: "Post is on-topic.", createdAt: daysAgo(5) },
    { id: "aud-3", actorId: "u-admin", actorName: "Admin Kim", action: "course.approve", target: "IELTS Advanced", createdAt: daysAgo(40) },
    { id: "aud-4", actorId: "u-admin", actorName: "Admin Kim", action: "user.role_change", target: "Long Nguyen", detail: "learner → instructor", createdAt: daysAgo(150) },
  ];

  // Seeded attempts predate live tracking: give each one a before/after snapshot that ends at the learner's current mastery.
  for (const a of attempts) {
    if (a.status !== "submitted" || a.masteryAfter) continue;
    const set = setById[a.quizId];
    const tested = Array.from(new Set(set.questions.flatMap((q) => q.skills.map((x) => x.skillId))));
    const acc = a.totalScore / Math.max(1, a.maxScore);
    const cur = (sid: string) => mastery.find((m) => m.userId === a.userId && m.skillId === sid)?.masteryProb ?? 0.3;
    a.masteryAfter = Object.fromEntries(tested.map((sid) => [sid, cur(sid)]));
    a.masteryBefore = Object.fromEntries(tested.map((sid) => [sid, Math.round(Math.max(0.05, Math.min(0.95, cur(sid) - (acc - 0.6) * 0.18)) * 1000) / 1000]));
  }

  return {
    version: DB_VERSION, users, skills: SKILLS, courses, lessons, practiceSets, attempts, enrollments, mastery, posts, notifications,
    reports, audit, assignments, submissions, notes: [{ userId: "u-learner", lessonId: "int-r3", text: "FALSE = writer says the opposite. NG = writer says nothing.\nWatch qualifiers: always / only / most.", updatedAt: daysAgo(0, 2) }],
    resetTokens: [], recEvents: [],
  };
}
