import { Router, Request, Response } from 'express';
import { ClaudeProcessPool } from '../claude-process-pool';

export function createHealthRouter(processPool?: ClaudeProcessPool): Router {
  const r = Router();
  r.get('/usage', (req: Request, res: Response) => {
    res.json({ month: new Date().toISOString().slice(0,7), kimi_tokens: 0, kimi_cost_rmb: 0, sessions: 0 });
  });
  r.get('/search/messages', (req: Request, res: Response) => {
    res.json({ results: [] });
  });
  r.get('/agent/stats', (req: Request, res: Response) => {
    const stats = processPool?.stats() || { total: 0, running: 0, idle: 0, crashed: 0 };
    res.json({ status: 'ok', pm2: { status: 'online' }, claudeProcesses: stats, memory: { rssMB: Math.round(process.memoryUsage().rss/1048576) }, disk: { freeGB: 0 }, agentEngineUse: 'ok' });
  });
  return r;
}
