'use strict';

class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const notFound = (msg = 'Not found') => new AppError(404, 'NOT_FOUND', msg);
const forbidden = (msg = 'Forbidden') => new AppError(403, 'FORBIDDEN', msg);
const badRequest = (msg = 'Bad request') => new AppError(400, 'BAD_REQUEST', msg);
const conflict = (msg = 'Conflict') => new AppError(409, 'CONFLICT', msg);

module.exports = { AppError, notFound, forbidden, badRequest, conflict };
