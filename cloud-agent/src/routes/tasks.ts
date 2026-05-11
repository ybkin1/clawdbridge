import { Router, Request, Response } from 'express';
import { TaskManager } from '../task-manager';
import { createTaskReqSchema } from './schemas';

export function createTaskRouter(taskMgr: TaskManager): Router {
  const r = Router();
  r.get('/', (req: Request, res: Response) => {
    if (!req.userId) { res.status(401).json({ error: 'unauthorized', code: 'AUTH_005', reqId: req.reqId }); return; }
    const tasks = taskMgr.list(req.userId, { status: req.query.status as string, repo: req.query.repo as string });
    res.json({ tasks: tasks.map(t => ({ id: t.id, title: t.title, repo: t.repo, status: t.status, tags: JSON.parse(t.tags as unknown as string || '[]'), category: t.category, createdAt: t.created_at, updatedAt: t.updated_at, sessionsCount: 0 })) });
  });
  r.post('/', (req: Request, res: Response) => {
    const parsed = createTaskReqSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_request', code: 'TASK_001', reqId: req.reqId }); return; }
    const task = taskMgr.create(parsed.data.title, parsed.data.repo, req.userId);
    res.status(201).json({ task: { id: task.id, title: task.title, repo: task.repo, status: task.status, createdAt: task.created_at } });
  });
  r.get('/:id', (req: Request, res: Response) => {
    const task = taskMgr.getById(req.params.id);
    if (!task) { res.status(404).json({ error: 'not_found', code: 'TASK_002', reqId: req.reqId }); return; }
    res.json({ task: { id: task.id, title: task.title, repo: task.repo, status: task.status, tags: JSON.parse(task.tags as unknown as string || '[]'), category: task.category, createdAt: task.created_at, updatedAt: task.updated_at, sessions: [] } });
  });
  r.post('/:id/pause', (req: Request, res: Response) => { taskMgr.pause(req.params.id); res.json({ task: { status: 'paused' } }); });
  r.post('/:id/resume', (req: Request, res: Response) => { taskMgr.resume(req.params.id); res.json({ task: { status: 'in_progress' } }); });
  r.post('/:id/retry', (req: Request, res: Response) => {
    const result = taskMgr.retry(req.params.id);
    res.json({ task: { id: req.params.id, status: 'in_progress' }, session: { id: result.id, status: 'running' } });
  });
  return r;
}
