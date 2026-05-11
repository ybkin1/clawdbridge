import { Router, Request, Response } from 'express';
import { JWTIssuer } from '../jwt-issuer';
import { oauthReqSchema } from './schemas';
import { AppError } from './errors';
import { v4 as uuid } from 'uuid';

export function createAuthRouter(jwtIssuer: JWTIssuer): Router {
  const r = Router();
  r.post('/oauth', async (req: Request, res: Response) => {
    const parsed = oauthReqSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'missing_code', code: 'AUTH_002', reqId: req.reqId }); return; }
    const { code } = parsed.data;
    try {
      // GitHub OAuth: code → access_token → /user
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code }),
      });
      const tokenData: any = await tokenRes.json();
      if (tokenData.error) { res.status(401).json({ error: 'invalid_code', code: 'AUTH_003', reqId: req.reqId }); return; }
      const userRes = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
      const user: any = await userRes.json();
      const deviceId = uuid();
      const tokens = jwtIssuer.issueTokenPair({ github_user_id: user.id, github_login: user.login, device_id: deviceId });
      res.json({ ...tokens, user: { id: user.id, login: user.login, avatar_url: user.avatar_url }, deviceId });
    } catch { throw new AppError('oauth_failed', 500); }
  });
  r.post('/refresh', (req: Request, res: Response) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) { res.status(401).json({ error: 'invalid_token', code: 'AUTH_001', reqId: req.reqId }); return; }
    const payload = jwtIssuer.verify(token);
    if (!payload) { res.status(401).json({ error: 'invalid_token', code: 'AUTH_001', reqId: req.reqId }); return; }
    const tokens = jwtIssuer.issueTokenPair({ github_user_id: payload.github_user_id, github_login: payload.github_login, device_id: payload.device_id });
    res.json(tokens);
  });
  r.post('/revoke', (_req: Request, res: Response) => { res.json({ success: true }); });
  return r;
}
