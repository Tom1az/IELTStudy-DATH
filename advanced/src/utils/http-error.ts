export type HttpError = Error & { status?: number };

export const httpError = (status: number, message: string) => {
  const error: HttpError = new Error(message);
  error.status = status;
  return error;
};
