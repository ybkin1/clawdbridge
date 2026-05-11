import { Router, Request, Response } from 'express';
import { SessionManager } from '../session-manager';

export function createSessionRouter(sessionMgr: SessionManager): Router {
  const r = Router();
  r.get('/:id/messages', (req: Request, res: Response) => {
    const before = req.query.before ? parseInt(req.query.before as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const { messages, hasMore } = sessionMgr.getMessages(req.params.id, before, limit);
    res.json({ messages: messages.map(m => ({ id: m.id, type: m.type, content: m.content, seq: m.seq, timestamp: m.timestamp, status: m.status, metadata: JSON.parse(m.metadata as unknown as string || '{}') })), hasMore });
  });
  return r;
}
