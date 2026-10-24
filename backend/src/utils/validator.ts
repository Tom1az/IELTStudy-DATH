import Joi from "joi";
import type { NextFunction, Request, Response } from "express";

// The contract's 400 shape: `{ error: { message, details } }`, one detail per invalid field.
// `abortEarly: false` makes Joi report every invalid field, not just the first one.
const sendValidationError = (res: Response, error: Joi.ValidationError) => {
  return res.status(400).json({
    error: {
      message: "Validation failed",
      details: error.details.map((detail) => detail.message),
    },
  });
};

const validateBody = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Express 5 leaves req.body undefined when the request has no body (e.g. an approve without
    // feedback). Validating {} instead still rejects missing required fields.
    const { error, value } = schema.validate(req.body ?? {}, { abortEarly: false });

    if (error) return sendValidationError(res, error);

    req.value ??= {};
    req.value.body = value;
    next();
  };
};

// Query strings like `?status=pending_review`. Express 5 makes `req.query` read-only, so the
// validated copy goes in `req.value.query`.
const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, { abortEarly: false });

    if (error) return sendValidationError(res, error);

    req.value ??= {};
    req.value.query = value;
    next();
  };
};

const validateParams = (schema: Joi.ObjectSchema, field: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate({ param: req.params[field] }, { abortEarly: false });

    if (error) return sendValidationError(res, error);

    req.value ??= {};
    req.value.params ??= {};
    req.value.params[field] = value.param;
    next();
  };
};

// Emails are stored lowercase, so "Alice@x.com" and "alice@x.com" are the same account
const email = Joi.string().trim().lowercase().email();
const fullName = Joi.string().trim().min(3).max(30);
// IELTS bands go from 0 to 9 in steps of 0.5. null clears the target.
const targetBand = Joi.number().min(0).max(9).multiple(0.5).allow(null);

// Enum values, the same as schema.prisma
const courseLevel = Joi.string().valid("beginner", "intermediate", "advanced");
const courseStatus = Joi.string().valid(
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "archived",
);
const lessonKind = Joi.string().valid("core", "remedial");
const mediaType = Joi.string().valid("reading_text", "listening_audio", "video");
const skillCategory = Joi.string().valid("listening", "reading", "writing", "speaking");

const courseTitle = Joi.string().trim().min(3).max(255);
const courseDescription = Joi.string().trim().max(5000).allow(null, "");
const feedback = Joi.string().trim().max(5000);

const lessonTitle = Joi.string().trim().min(3).max(255);
const lessonContent = Joi.string().max(50000).allow(null, "");
const orderIndex = Joi.number().integer().min(0);
// Skill tags on a lesson or a question: at least one, and no skill twice
const skillWeights = Joi.array()
  .items(
    Joi.object().keys({
      skillId: Joi.number().integer().positive().required(),
      weight: Joi.number().greater(0).max(1).required(),
    }),
  )
  .min(1)
  .unique("skillId");

const questionType = Joi.string().valid(
  "multiple_choice",
  "true_false_not_given",
  "gap_fill",
  "matching",
  "error_identification",
);
const questionText = Joi.string().trim().min(1).max(2000);
const explanation = Joi.string().trim().max(2000).allow(null, "");
const difficulty = Joi.number().integer().min(1).max(5);
// The general shape of options and answerKey. Which shape goes with which question type
// (the JSONB table in docs/ERD.md) is checked in services/questions.ts, because PATCH has to
// check it on the merged question.
const choiceOption = Joi.object().keys({
  id: Joi.string().trim().min(1).max(20).required(),
  text: Joi.string().trim().min(1).max(1000).required(),
});
const questionOptions = Joi.alternatives()
  .try(
    Joi.array().items(choiceOption),
    Joi.object().keys({
      items: Joi.array().items(choiceOption).min(1).required(),
      choices: Joi.array().items(choiceOption).min(1).required(),
    }),
  )
  .allow(null);
const answerText = Joi.string().trim().min(1).max(500);
const answerKey = Joi.alternatives().try(
  answerText,
  Joi.array().items(answerText).min(1),
  Joi.object().pattern(Joi.string(), answerText),
);

// A learner's answer (the contract's Answer): a string, or for matching an object of
// item id -> choice id. Which one fits the question type is checked in services/grading.ts.
const learnerAnswer = Joi.alternatives().try(
  answerText,
  Joi.object().pattern(Joi.string(), answerText),
);

const quizKind = Joi.string().valid("diagnostic", "lesson", "practice");
const quizTitle = Joi.string().trim().min(3).max(255);
const quizDescription = Joi.string().trim().max(5000).allow(null, "");
const timeLimitSeconds = Joi.number().integer().min(1).allow(null);
// The quiz's questions in the order learners will see them, each at most once
const questionIds = Joi.array().items(Joi.number().integer().positive()).min(1).unique();

const passageTitle = Joi.string().trim().max(255).allow(null, "");
const passageContent = Joi.string().max(50000).allow(null);
const mediaPath = Joi.string().trim().max(1024).allow(null);
// File types instructors may upload: audio, video and images (the contract's UploadRequest)
const uploadContentType = Joi.string().valid(
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "video/mp4",
  "video/webm",
  "image/png",
  "image/jpeg",
);

const schemas = {
  idSchema: Joi.object().keys({
    param: Joi.number().integer().positive().required(),
  }),

  registerSchema: Joi.object().keys({
    email: email.max(255).required(),
    fullName: fullName.required(),
    // bcrypt ignores everything after the first 72 bytes, so longer passwords are rejected.
    // "utf8" makes Joi count bytes instead of characters (an accented letter is 2 bytes).
    password: Joi.string().min(8).max(72, "utf8").required(),
  }),

  loginSchema: Joi.object().keys({
    email: email.required(),
    password: Joi.string().required(),
  }),

  profileUpdateSchema: Joi.object()
    .keys({
      fullName,
      targetBand,
    })
    .min(1),

  // ----- Courses -----
  courseInputSchema: Joi.object().keys({
    title: courseTitle.required(),
    description: courseDescription,
    targetLevel: courseLevel.required(),
  }),

  courseUpdateSchema: Joi.object()
    .keys({
      title: courseTitle,
      description: courseDescription,
      targetLevel: courseLevel,
    })
    .min(1),

  approveInputSchema: Joi.object().keys({
    feedback: feedback.allow(""),
  }),

  rejectInputSchema: Joi.object().keys({
    feedback: feedback.min(1).required(),
  }),

  catalogQuerySchema: Joi.object().keys({
    level: courseLevel,
  }),

  courseStatusQuerySchema: Joi.object().keys({
    status: courseStatus,
  }),

  // ----- Lessons -----
  lessonInputSchema: Joi.object().keys({
    title: lessonTitle.required(),
    content: lessonContent,
    kind: lessonKind.required(),
    orderIndex: orderIndex.required(),
    skills: skillWeights.required(),
  }),

  lessonUpdateSchema: Joi.object()
    .keys({
      title: lessonTitle,
      content: lessonContent,
      kind: lessonKind,
      orderIndex,
      skills: skillWeights,
    })
    .min(1),

  progressInputSchema: Joi.object().keys({
    status: Joi.string().valid("in_progress", "completed").required(),
  }),

  // ----- Passages -----
  // The "reading text needs content, audio and video need mediaPath" rule is checked in
  // controllers/passages.ts, because PATCH has to check it on the merged row.
  passageInputSchema: Joi.object().keys({
    lessonId: Joi.number().integer().positive().allow(null),
    type: mediaType.required(),
    title: passageTitle,
    content: passageContent,
    mediaPath,
    orderIndex: orderIndex.default(0),
  }),

  passageUpdateSchema: Joi.object()
    .keys({
      type: mediaType,
      title: passageTitle,
      content: passageContent,
      mediaPath,
      orderIndex,
    })
    .min(1),

  // ----- Questions -----
  questionInputSchema: Joi.object().keys({
    passageId: Joi.number().integer().positive().allow(null),
    questionType: questionType.required(),
    questionText: questionText.required(),
    options: questionOptions,
    answerKey: answerKey.required(),
    explanation,
    difficulty: difficulty.default(3),
    // The question's Q-matrix row. "Weights add up to 1" is checked in services/questions.ts,
    // so the message can show the sum.
    skills: skillWeights.required(),
  }),

  questionUpdateSchema: Joi.object()
    .keys({
      passageId: Joi.number().integer().positive().allow(null),
      questionType,
      questionText,
      options: questionOptions,
      answerKey,
      explanation,
      difficulty,
      skills: skillWeights,
    })
    .min(1),

  questionQuerySchema: Joi.object().keys({
    skillId: Joi.number().integer().positive(),
    passageId: Joi.number().integer().positive(),
    type: questionType,
  }),

  // ----- Quizzes -----
  // Which kinds need a lessonId (lesson and practice) is checked in controllers/quizzes.ts
  quizInputSchema: Joi.object().keys({
    kind: quizKind.required(),
    lessonId: Joi.number().integer().positive().allow(null),
    title: quizTitle.required(),
    description: quizDescription,
    timeLimitSeconds,
    questionIds: questionIds.required(),
  }),

  quizUpdateSchema: Joi.object()
    .keys({
      title: quizTitle,
      description: quizDescription,
      timeLimitSeconds,
      questionIds,
    })
    .min(1),

  // ----- Attempts -----
  // In the order the learner answered; skipped questions are left out
  submitAttemptSchema: Joi.object().keys({
    responses: Joi.array()
      .items(
        Joi.object().keys({
          questionId: Joi.number().integer().positive().required(),
          answer: learnerAnswer.required(),
          responseTimeSeconds: Joi.number().min(0),
        }),
      )
      .max(200)
      .unique("questionId")
      .required(),
  }),

  myAttemptsQuerySchema: Joi.object().keys({
    quizId: Joi.number().integer().positive(),
  }),

  // ----- Uploads -----
  uploadRequestSchema: Joi.object().keys({
    fileName: Joi.string().trim().min(1).max(255).required(),
    contentType: uploadContentType.required(),
  }),

  // ----- Skills -----
  skillQuerySchema: Joi.object().keys({
    category: skillCategory,
  }),
};

export { validateBody, validateParams, validateQuery, schemas };
