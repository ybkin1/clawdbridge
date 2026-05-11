import { Request, Response, NextFunction } from 'express';
import { AppError, serializeError } from '../routes/errors';

export function errorHandlerMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const { error, code, reqId, details } = serializeError(err, req.reqId || 'unknown');
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  res.status(statusCode).json({ error, code, reqId, ...(details ? { details } : {}) });
}
