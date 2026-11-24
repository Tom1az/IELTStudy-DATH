// Demo data for the three roles, on top of `npm run seed`: learners with placement results,
// enrolments, lesson progress and quiz history (so mastery, recommendations and the admin stats
// have something to show), a second instructor with a course waiting for review, instructor
// feedback, a lesson discussion, an open content report and audit entries.
//
//   npm run seed && npm run seed:demo
//
// It goes through the app's own services (submit, feedback, comments, reports), so BKT,
// recommendations and notifications are produced exactly as in real use. Demo learners use
// @demo.ieltstudy.dev emails and SEED_PASSWORD. Runs once: it refuses if the demo users exist.
// Deterministic: the same database gives the same result.
import bcrypt from "bcrypt";
import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "./db.ts";
import { varchar } from "../utils/db-types.ts";
import { toPublicUser } from "../utils/public-user.ts";
import type { PublicUser } from "../utils/public-user.ts";
import { audit } from "../services/audit.ts";
import { startOrResumeAttempt, submitAttempt } from "../services/attempts.ts";
import type { SubmittedResponse } from "../services/attempts.ts";
import { createComment } from "../services/comments.ts";
import type { Answer } from "../services/grading.ts";
import { saveFeedback } from "../services/grading-review.ts";
import { loadQuizQuestions } from "../services/quiz-views.ts";
import type { QuestionRow } from "../services/quiz-views.ts";
import { createReport } from "../services/reports.ts";

const orm = db.orm.public;
type Category = "listening" | "reading" | "writing" | "speaking";

// A seeded random number generator, so every run gives the same demo
let state = 20261124;
const random = () => {
  state = (state * 1664525 + 1013904223) >>> 0;
  return state / 4294967296;
};

// Each learner answers a question right with this chance, by the question's main skill category
const LEARNERS: Array<{ name: string; email: string; band: number; ability: Record<Category, number>; courses: number; lessonsDone: number }> = [
  { name: "Linh Nguyen", email: "linh@demo.ieltstudy.dev", band: 6.5, ability: { listening: 0.75, reading: 0.55, writing: 0.45, speaking: 0.6 }, courses: 2, lessonsDone: 5 },
  { name: "Minh Tran", email: "minh@demo.ieltstudy.dev", band: 5.5, ability: { listening: 0.4, reading: 0.45, writing: 0.35, speaking: 0.5 }, courses: 1, lessonsDone: 2 },
  { name: "An Le", email: "an@demo.ieltstudy.dev", band: 7, ability: { listening: 0.85, reading: 0.8, writing: 0.7, speaking: 0.75 }, courses: 2, lessonsDone: 99 },
  { name: "Bao Pham", email: "bao@demo.ieltstudy.dev", band: 6, ability: { listening: 0.55, reading: 0.65, writing: 0.5, speaking: 0.4 }, courses: 1, lessonsDone: 3 },
  { name: "Chi Vo", email: "chi@demo.ieltstudy.dev", band: 6.5, ability: { listening: 0.6, reading: 0.4, writing: 0.6, speaking: 0.55 }, courses: 1, lessonsDone: 1 },
  { name: "Duc Hoang", email: "duc@demo.ieltstudy.dev", band: 5, ability: { listening: 0.35, reading: 0.3, writing: 0.3, speaking: 0.35 }, courses: 1, lessonsDone: 0 },
];

// A right answer is the key; a wrong one is a value that matches nothing
const answerFor = (question: QuestionRow, right: boolean): Answer => {
  const key = question.answerKey as unknown;
  if (question.questionType === "matching") {
    const map = key as Record<string, string>;
    return right ? map : Object.fromEntries(Object.keys(map).map((item) => [item, "none"]));
  }
  if (!right) return question.questionType === "true_false_not_given" ? (key === "true" ? "false" : "true") : "zzz";
  return Array.isArray(key) ? String(key[0]) : String(key);
};

// The main skill category of a question, from its heaviest skill tag
const categoryOf = async (questionId: number): Promise<Category> => {
  const tags = await orm.QuestionSkills.where({ questionId }).include("skill", (s) => s.select("category")).all();
  tags.sort((a, b) => b.weight - a.weight);
  return (tags[0]?.skill?.category ?? "reading") as Category;
};

const takeQuiz = async (quizId: number, user: PublicUser, ability: Record<Category, number>) => {
  const { attempt } = await startOrResumeAttempt(quizId, user);
  const questions = await loadQuizQuestions(quizId);
  const responses: SubmittedResponse[] = [];
  for (const question of questions) {
    // Now and then a question is skipped
    if (random() < 0.05) continue;
    const right = random() < ability[await categoryOf(question.questionId)];
    responses.push({ questionId: question.questionId, answer: answerFor(question, right), responseTimeSeconds: Math.round(8 + random() * 40) });
  }
  return submitAttempt(attempt, responses);
};

// Moves an attempt back in time, so the history and the trend chart span several weeks
const backdate = async (attemptId: number, days: number) => {
  await db.runtime().execute(
    db.raw.sql`
      UPDATE quiz_attempts
      SET started_at = started_at - make_interval(days => ${days}),
          completed_at = completed_at - make_interval(days => ${days})
      WHERE attempt_id = ${attemptId}
    `.affectedCount().build(),
  );
};

const main = async () => {
  const password = process.env["SEED_PASSWORD"];
  if (!password || password.length < 8) throw new Error("Set SEED_PASSWORD (at least 8 characters).");
  if (await orm.Users.first({ email: varchar<255>(LEARNERS[0]!.email) })) {
    throw new Error("The demo data is already there.");
  }
  const admin = await orm.Users.first({ email: varchar<255>("admin@ieltstudy.dev") });
  const instructor = await orm.Users.first({ email: varchar<255>("instructor@ieltstudy.dev") });
  const diagnostic = await orm.Quizzes.first({ kind: "diagnostic" });
  if (!admin || !instructor || !diagnostic) throw new Error("Run `npm run seed` first.");
  const hashedPass = varchar<255>(await bcrypt.hash(password, 10));

  const courses = await orm.Courses.where({ status: "approved" }).orderBy((c) => c.courseId.asc()).all();
  const coreByCourse = new Map<number, number[]>();
  for (const course of courses) {
    const core = await orm.Lessons.where({ courseId: course.courseId, kind: "core" })
      .orderBy([(l) => l.orderIndex.asc(), (l) => l.lessonId.asc()])
      .all();
    coreByCourse.set(course.courseId, core.map((l) => l.lessonId));
  }
  const lessonQuizzes = await orm.Quizzes.where({ kind: "lesson" }).all();

  // ----- Learners -----
  const learners: PublicUser[] = [];
  const submitted: Array<{ attemptId: number; learner: PublicUser }> = [];
  for (const [index, spec] of LEARNERS.entries()) {
    const row = await orm.Users.create({
      email: varchar<255>(spec.email),
      fullName: varchar<255>(spec.name),
      hashedPass,
      role: "learner",
      targetBand: spec.band,
    });
    const learner = toPublicUser(row);
    learners.push(learner);

    // The placement quiz seeds every skill's mastery (cold start)
    const placement = await takeQuiz(diagnostic.quizId, learner, spec.ability);
    await backdate(placement.attemptId, 28 - index);

    // Enrol in the course(s) that fit the target band, and work through some core lessons
    const start = spec.band < 6 ? 0 : 1;
    for (const course of courses.slice(start, start + spec.courses)) {
      await orm.Enrollments.create({ userId: learner.userId, courseId: course.courseId });
      const core = coreByCourse.get(course.courseId) ?? [];
      const done = core.slice(0, Math.min(core.length, spec.lessonsDone));
      for (const lessonId of done) {
        await orm.LessonProgress.create({ userId: learner.userId, lessonId, status: "completed", completedAt: Temporal.Now.instant() });
      }
      if (done.length < core.length && core[done.length] !== undefined) {
        await orm.LessonProgress.create({ userId: learner.userId, lessonId: core[done.length]!, status: "in_progress", completedAt: null });
      }
      if (core.length > 0 && done.length === core.length) {
        await orm.Enrollments.where({ userId: learner.userId, courseId: course.courseId }).update({ completedAt: Temporal.Now.instant() });
      }

      // Each course's lesson quiz, two to three times, getting a little better each time
      const quiz = lessonQuizzes.find((q) => q.lessonId !== null && core.includes(q.lessonId));
      if (quiz && done.length > 0) {
        const tries = 2 + (index % 2);
        for (let t = 0; t < tries; t++) {
          const better = Object.fromEntries(
            Object.entries(spec.ability).map(([k, v]) => [k, Math.min(0.95, v + t * 0.08)]),
          ) as Record<Category, number>;
          const attempt = await takeQuiz(quiz.quizId, learner, better);
          await backdate(attempt.attemptId, 20 - t * 6 - index);
          submitted.push({ attemptId: attempt.attemptId, learner });
        }
      }
    }
  }

  // ----- Instructor feedback on some attempts -----
  const instructorUser = toPublicUser(instructor);
  const comments = [
    "Good progress on the listening section. Read all options before choosing on the distractor questions.",
    "Watch the spelling in gap-fill answers: a misspelt word is marked wrong in the real test too.",
    "Solid result. Try the remedial lesson on True / False / Not Given before your next attempt.",
  ];
  for (const [i, item] of submitted.filter((_, i) => i % 3 === 0).slice(0, 3).entries()) {
    await saveFeedback(instructorUser, item.attemptId, { comment: comments[i]!, totalScore: null });
  }

  // ----- Discussion on the first lesson of the intermediate course -----
  const discussionLesson = coreByCourse.get(courses[1]!.courseId)?.[0];
  if (discussionLesson) {
    // Linh, An, Bao and Chi are enrolled in the intermediate course
    const [linh, , an, bao, chi] = learners;
    const q1 = await createComment(discussionLesson, linh!, { body: "In the form-completion part, do I lose marks if I write the number as a word?" });
    await createComment(discussionLesson, instructorUser, { body: "Both are accepted as long as the word limit allows it. Numbers are safer, though: there is no spelling to get wrong.", parentId: q1.commentId });
    await createComment(discussionLesson, an!, { body: "Thanks, I always wrote words and lost marks on spelling.", parentId: q1.commentId });
    await createComment(discussionLesson, chi!, { body: "Is there a list of the most common distractors in Part 1?" });
    const spam = await createComment(discussionLesson, bao!, { body: "Buy cheap IELTS certificates, message me!!!" });
    // Linh reports the spam: an open report for the admin's queue
    await createReport(linh!, { targetType: "comment", targetId: spam.commentId, reason: "Spam or advertising: selling certificates" });
  }

  // ----- A second instructor, promoted by the admin, with a course waiting for review -----
  const trang = await orm.Users.create({
    email: varchar<255>("trang@demo.ieltstudy.dev"),
    fullName: varchar<255>("Thu Trang Instructor"),
    hashedPass,
    role: "learner",
  });
  await db.transaction(async (tx) => {
    await tx.orm.public.Users.where({ userId: trang.userId }).update({ role: "instructor" });
    await audit(tx.orm.public, admin.userId, {
      action: "user.role_change",
      targetType: "user",
      targetId: trang.userId,
      summary: `Changed the role of ${trang.email} from learner to instructor`,
      details: { from: "learner", to: "instructor" },
    });
  });
  const pending = await orm.Courses.create({
    instructorId: trang.userId,
    title: varchar<255>("Speaking Part 2: The Long Turn"),
    description: "Plan a two-minute answer in one minute, and keep talking with discourse markers.",
    targetLevel: "intermediate",
    status: "pending_review",
    submittedAt: Temporal.Now.instant(),
  });
  const speaking = await orm.Skills.first({ skillCode: varchar<64>("S_DISCOURSE_MARKERS") });
  const lesson = await orm.Lessons.create({
    courseId: pending.courseId,
    title: varchar<255>("One minute to plan: the cue card method"),
    content: "Read the cue card, then write four keywords: who/what, when, why it matters, how you felt.",
    kind: "core",
    orderIndex: 0,
  });
  if (speaking) await orm.LessonSkills.create({ lessonId: lesson.lessonId, skillId: speaking.skillId, weight: 1 });

  // A learner the admin had to suspend
  const suspended = await orm.Users.create({
    email: varchar<255>("spam@demo.ieltstudy.dev"),
    fullName: varchar<255>("Spam Account"),
    hashedPass,
    role: "learner",
  });
  await db.transaction(async (tx) => {
    await tx.orm.public.Users.where({ userId: suspended.userId }).update({ isActive: false });
    await audit(tx.orm.public, admin.userId, {
      action: "user.deactivate",
      targetType: "user",
      targetId: suspended.userId,
      summary: `Deactivated the account ${suspended.email}`,
      details: null,
    });
  });

  const mastery = await orm.UserSkillMastery.aggregate((agg) => ({ count: agg.count() }));
  const recs = await orm.Recommendations.aggregate((agg) => ({ count: agg.count() }));
  const attempts = await orm.QuizAttempts.where((a) => and(a.completedAt.isNotNull())).aggregate((agg) => ({ count: agg.count() }));
  console.log(
    `Demo data: ${learners.length} learners (${LEARNERS.map((l) => l.email).join(", ")}), ` +
      `${attempts.count} completed attempts, ${mastery.count} mastery rows, ${recs.count} recommendations, ` +
      `1 course waiting for review, 1 open report. Password: SEED_PASSWORD.`,
  );
};

try {
  await main();
} finally {
  await db.close();
}
