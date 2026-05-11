import { Request, Response, NextFunction } from 'express';
import { JWTIssuer } from '../jwt-issuer';

export function jwtVerifierMiddleware(jwtIssuer: JWTIssuer) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path.startsWith('/health') || req.path.startsWith('/metrics')) { return next(); }
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) { res.status(401).json({ error: 'missing_token', code: 'AUTH_004', reqId: req.reqId }); return; }
    const payload = jwtIssuer.verify(token);
    if (!payload) { res.status(401).json({ error: 'invalid_token', code: 'AUTH_001', reqId: req.reqId }); return; }
    req.userId = String(payload.github_user_id);
    req.deviceId = payload.device_id;
    next();
  };
}
