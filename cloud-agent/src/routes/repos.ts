import { Router, Request, Response } from 'express';
import { RepoRouter } from '../repo-router';
import { createRepoReqSchema } from './schemas';

export function createRepoRouter(repoRouter: RepoRouter): Router {
  const r = Router();
  r.get('/', (req: Request, res: Response) => { res.json({ repos: repoRouter.list(req.userId!) }); });
  r.post('/', (req: Request, res: Response) => {
    const parsed = createRepoReqSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_request', code: 'REPO_001', reqId: req.reqId }); return; }
    const { name, gitRemote, branches } = parsed.data;
    const workDir = `/repos/${name}`;
    repoRouter.register(name, workDir, gitRemote, branches, req.userId!);
    res.status(201).json({ repo: { name, workDir, gitRemote, branches } });
  });
  r.delete('/:name', (req: Request, res: Response) => { repoRouter.unregister(req.params.name, req.userId!); res.json({ success: true }); });
  return r;
}
