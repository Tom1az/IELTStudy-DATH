import Joi from "joi";
import type { NextFunction, Request, Response } from "express";

const validateBody = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body);

    if (error) {
      return res.status(400).json({
        error: error.details.map((detail) => detail.message),
      });
    }

    req.value ??= {};
    req.value.body = value;
    next();
  };
};

const validateParams = (schema: Joi.ObjectSchema, field: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate({ param: req.params[field] });

    if (error) {
      return res.status(400).json({
        error: error.details.map((detail) => detail.message),
      });
    }

    req.value ??= {};
    req.value.params ??= {};
    req.value.params[field] = value.param;
    next();
  };
};

const schemas = {
  idSchema: Joi.object().keys({
    param: Joi.number().integer().positive().required(),
  }),

  userSchema: Joi.object().keys({
    email: Joi.string().email().required(),
    fullName: Joi.string().trim().min(3).max(30).required(),
    password: Joi.string().min(8).required(),
  }),

  userUpdateSchema: Joi.object()
    .keys({
      email: Joi.string().email(),
      fullName: Joi.string().trim().min(3).max(30),
    })
    .min(1),
};

export { validateBody, validateParams, schemas };
