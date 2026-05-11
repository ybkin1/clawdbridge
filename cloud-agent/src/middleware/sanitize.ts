import { Request, Response, NextFunction } from 'express';

function sanitizeValue(val: unknown): unknown {
  if (typeof val === 'string') return val.replace(/<[^>]*>/g, '');
  if (Array.isArray(val)) return val.map(sanitizeValue);
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) { out[k] = sanitizeValue(v); }
    return out;
  }
  return val;
}

export function sanitizeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') req.body = sanitizeValue(req.body) as Record<string, unknown>;
  if (req.query && typeof req.query === 'object') req.query = sanitizeValue(req.query) as Record<string, unknown>;
  if (req.params && typeof req.params === 'object') req.params = sanitizeValue(req.params) as Record<string, unknown>;
  next();
}
