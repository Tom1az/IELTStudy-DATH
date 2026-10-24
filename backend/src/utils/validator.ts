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
    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) return sendValidationError(res, error);

    req.value ??= {};
    req.value.body = value;
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
};

export { validateBody, validateParams, schemas };
