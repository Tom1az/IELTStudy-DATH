'use strict';

class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const badRequest = (msg = 'Validation failed') => new AppError(400, msg);
const unauthorized = (msg = 'Please log in') => new AppError(401, msg);
const forbidden = (msg = "You don't have permission to do this") => new AppError(403, msg);
const notFound = (msg = 'Not found') => new AppError(404, msg);
const conflict = (msg = 'Conflict') => new AppError(409, msg);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };