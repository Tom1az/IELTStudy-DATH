import Joi from "joi";
import type { NextFunction, Request, Response } from "express";

const sendValidationError = (res: Response, error: Joi.ValidationError) => {
  return res.status(400).json({
    error: {
      message: "Validation failed",
      details: error.details.map((detail) => detail.message),
    },
  });
};

export const validateParams = (schema: Joi.ObjectSchema, field: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate({ param: req.params[field] }, { abortEarly: false });
    if (error) return sendValidationError(res, error);
    req.value ??= {};
    req.value.params ??= {};
    req.value.params[field] = value.param;
    next();
  };
};

export const schemas = {
  idSchema: Joi.object().keys({
    param: Joi.number().integer().positive().required(),
  }),
};
