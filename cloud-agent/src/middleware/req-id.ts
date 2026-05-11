import { Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';

declare global { namespace Express { interface Request { reqId: string; userId?: string; deviceId?: string; } } }

export function reqIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.reqId = uuid();
  res.setHeader('X-Request-Id', req.reqId);
  next();
}
