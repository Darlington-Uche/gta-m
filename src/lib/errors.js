export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const bad = (code, msg, d) => new AppError(400, code, msg, d);
export const unauthorized = (msg = 'Sign in required') => new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Not allowed') => new AppError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found') => new AppError(404, 'not_found', msg);
export const conflict = (code, msg, d) => new AppError(409, code, msg, d);
export const unavailable = (msg) => new AppError(503, 'unavailable', msg);
