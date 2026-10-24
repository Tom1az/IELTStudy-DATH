// An Error with an HTTP status. The error handler in app.ts sends `status` (500 when missing)
// and the message as `{ error: { message } }`.
export type HttpError = Error & { status?: number };

export const httpError = (status: number, message: string) => {
  const error: HttpError = new Error(message);
  error.status = status;
  return error;
};
