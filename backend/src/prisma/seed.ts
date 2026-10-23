// Seeds a freshly migrated database: users, skill taxonomy, the diagnostic and three courses.
// Everything runs in one transaction, so if any step or check fails, nothing is saved.
import bcrypt from "bcrypt";
import { db } from "./db.ts";
import { varchar } from "../utils/db-types.ts";
import { courses, diagnostic, skills } from "./seed-data.ts";
import type { QuestionGroup, SeedLesson } from "./seed-data.ts";

// The model collections we write to. Inside the transaction we use tx.orm.public, which has the same type.
type Orm = typeof db.orm.public;

const saltRounds = 10;
// Weights are floats, so "sums to 1" means "within this tolerance of 1"
const WEIGHT_TOLERANCE = 1e-9;

// skillCode -> skill_id, filled in when the skills are created
const skillIds = new Map<string, number>();

const getSkillId = (code: string) => {
  const id = skillIds.get(code);
  if (id === undefined) {
    throw new Error(`Seed data uses an unknown skill code: ${code}`);
  }
  return id;
};

const createSkills = async (orm: Orm) => {
  for (const skill of skills) {
    const row = await orm.Skills.create({
      skillCode: varchar<64>(skill.code),
      name: varchar<255>(skill.name),
      category: skill.category,
      description: skill.description,
    });
    skillIds.set(skill.code, row.skillId);
  }
};

// Creates the passages and questions of a quiz, tags each question with its skills (the Q-matrix)
// and adds it to the quiz in order
const createQuizQuestions = async (
  orm: Orm,
  quizId: number,
  groups: QuestionGroup[],
  createdById: number,
  lessonId: number | null,
) => {
  let orderIndex = 0;

  for (const group of groups) {
    let passageId: number | null = null;
    if (group.passage) {
      const passage = await orm.PassagesMedia.create({
        lessonId,
        createdById,
        type: group.passage.type,
        title: varchar<255>(group.passage.title),
        content: group.passage.content,
        mediaPath: group.passage.mediaPath ? varchar<1024>(group.passage.mediaPath) : null,
      });
      passageId = passage.passageId;
    }

    for (const question of group.questions) {
      const row = await orm.Questions.create({
        passageId,
        createdById,
        questionType: question.type,
        questionText: question.text,
        options: question.options ?? null,
        answerKey: question.answer,
        explanation: question.explanation ?? null,
        difficulty: question.difficulty ?? 3,
      });

      for (const code in question.skills) {
        await orm.QuestionSkills.create({
          questionId: row.questionId,
          skillId: getSkillId(code),
          weight: question.skills[code],
        });
      }

      await orm.QuizQuestions.create({ quizId, questionId: row.questionId, orderIndex });
      orderIndex++;
    }
  }
};

// Creates the lessons of one kind (core or remedial) with their skill tags. Returns the new lesson ids in order.
const createLessons = async (
  orm: Orm,
  courseId: number,
  lessons: SeedLesson[],
  kind: "core" | "remedial",
) => {
  const lessonIds: number[] = [];

  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    const row = await orm.Lessons.create({
      courseId,
      title: varchar<255>(lesson.title),
      content: lesson.content,
      kind,
      orderIndex: i,
    });

    for (const code in lesson.skills) {
      await orm.LessonSkills.create({
        lessonId: row.lessonId,
        skillId: getSkillId(code),
        weight: lesson.skills[code],
      });
    }
    lessonIds.push(row.lessonId);
  }

  return lessonIds;
};

const seed = async (orm: Orm, password: string) => {
  const existingSkill = await orm.Skills.first();
  if (existingSkill) {
    throw new Error(
      "The database already has data. Seed only runs on a freshly migrated database.",
    );
  }

  // All three demo accounts share the same password
  const hashedPass = varchar<255>(await bcrypt.hash(password, saltRounds));
  const admin = await orm.Users.create({
    email: varchar<255>("admin@ieltstudy.dev"),
    fullName: varchar<255>("Ada Admin"),
    hashedPass,
    role: "admin",
  });
  const instructor = await orm.Users.create({
    email: varchar<255>("instructor@ieltstudy.dev"),
    fullName: varchar<255>("Ian Instructor"),
    hashedPass,
    role: "instructor",
  });
  await orm.Users.create({
    email: varchar<255>("learner@ieltstudy.dev"),
    fullName: varchar<255>("Lena Learner"),
    hashedPass,
    role: "learner",
    targetBand: 6.5,
  });

  await createSkills(orm);

  const diagnosticQuiz = await orm.Quizzes.create({
    kind: "diagnostic",
    lessonId: null,
    createdById: admin.userId,
    title: varchar<255>(diagnostic.title),
    description: diagnostic.description,
    timeLimitSeconds: diagnostic.timeLimitSeconds,
  });
  await createQuizQuestions(orm, diagnosticQuiz.quizId, diagnostic.groups, admin.userId, null);

  // The seeded courses are already approved, so learners can see them
  const now = Temporal.Now.instant();
  for (const course of courses) {
    const courseRow = await orm.Courses.create({
      instructorId: instructor.userId,
      title: varchar<255>(course.title),
      description: course.description,
      targetLevel: course.level,
      status: "approved",
      reviewedById: admin.userId,
      submittedAt: now,
      reviewedAt: now,
    });

    const coreLessonIds = await createLessons(orm, courseRow.courseId, course.core, "core");
    await createLessons(orm, courseRow.courseId, course.remedial, "remedial");

    // Each course has one lesson quiz, attached to its first core lesson
    const firstLessonId = coreLessonIds[0];
    if (firstLessonId === undefined) {
      throw new Error(`Course "${course.title}" has no core lesson`);
    }
    const quiz = await orm.Quizzes.create({
      kind: "lesson",
      lessonId: firstLessonId,
      createdById: instructor.userId,
      title: varchar<255>(course.quiz.title),
    });
    await createQuizQuestions(
      orm,
      quiz.quizId,
      course.quiz.groups,
      instructor.userId,
      firstLessonId,
    );
  }

  await checkSeedData(orm, diagnosticQuiz.quizId);
};

// Reads the seeded rows back and throws (rolling back the transaction) if a rule from docs/ERD.md doesn't hold
const checkSeedData = async (orm: Orm, diagnosticQuizId: number) => {
  const allSkills = await orm.Skills.all();
  const questions = await orm.Questions.all();
  const questionSkills = await orm.QuestionSkills.all();
  const diagnosticItems = await orm.QuizQuestions.where({ quizId: diagnosticQuizId }).all();
  const lessons = await orm.Lessons.all();
  const lessonSkills = await orm.LessonSkills.all();

  // Rule 1: the diagnostic has exactly 30 questions
  if (diagnosticItems.length !== 30) {
    throw new Error(`The diagnostic has ${diagnosticItems.length} questions, expected 30`);
  }

  // Rule 2: each question's Q-matrix weights sum to 1
  const weightSums = new Map<number, number>();
  for (const row of questionSkills) {
    const sumSoFar = weightSums.get(row.questionId) ?? 0;
    weightSums.set(row.questionId, sumSoFar + row.weight);
  }
  for (const question of questions) {
    const sum = weightSums.get(question.questionId) ?? 0;
    if (Math.abs(sum - 1) > WEIGHT_TOLERANCE) {
      throw new Error(
        `Question ${question.questionId} has skill weights summing to ${sum}, expected 1`,
      );
    }
  }

  // Rule 3: the diagnostic assesses every skill
  const diagnosticQuestionIds = new Set<number>();
  for (const item of diagnosticItems) {
    diagnosticQuestionIds.add(item.questionId);
  }
  const assessedSkillIds = new Set<number>();
  for (const row of questionSkills) {
    if (diagnosticQuestionIds.has(row.questionId)) {
      assessedSkillIds.add(row.skillId);
    }
  }

  // Rule 4: every remedial lesson has a skill tag, and every skill has a remedial lesson
  const remedialLessonIds = new Set<number>();
  for (const lesson of lessons) {
    if (lesson.kind === "remedial") {
      remedialLessonIds.add(lesson.lessonId);
    }
  }
  const taggedLessonIds = new Set<number>();
  const remediatedSkillIds = new Set<number>();
  for (const tag of lessonSkills) {
    taggedLessonIds.add(tag.lessonId);
    if (remedialLessonIds.has(tag.lessonId)) {
      remediatedSkillIds.add(tag.skillId);
    }
  }

  for (const skill of allSkills) {
    if (!assessedSkillIds.has(skill.skillId)) {
      throw new Error(`Skill ${skill.skillCode} is not assessed by the diagnostic`);
    }
    if (!remediatedSkillIds.has(skill.skillId)) {
      throw new Error(`Skill ${skill.skillCode} has no remedial lesson`);
    }
  }
  for (const lessonId of remedialLessonIds) {
    if (!taggedLessonIds.has(lessonId)) {
      throw new Error(`Remedial lesson ${lessonId} has no skill tag`);
    }
  }

  console.log(
    `Seeded ${allSkills.length} skills, ${questions.length} questions (${diagnosticItems.length} in the diagnostic), ` +
      `${lessons.length} lessons (${remedialLessonIds.size} remedial).`,
  );
};

const password = process.env["SEED_PASSWORD"];
if (!password || password.length < 8) {
  console.error("Set SEED_PASSWORD (at least 8 characters) in .env before seeding.");
  process.exit(1);
}

try {
  await db.transaction(async (tx) => {
    await seed(tx.orm.public, password);
  });
} finally {
  await db.close();
}
