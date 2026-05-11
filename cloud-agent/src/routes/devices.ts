import { Router, Request, Response } from 'express';
import { DeviceDAO } from '../db/dao/repo-dao';
import Database from 'better-sqlite3';

export function createDeviceRouter(db: Database.Database): Router {
  const dao = new DeviceDAO(db);
  const r = Router();
  r.get('/', (req: Request, res: Response) => {
    const devices = dao.list(req.userId!);
    res.json({ devices: devices.map(d => ({ id: d.id, name: d.name, platform: d.platform, status: d.status, lastHeartbeat: d.last_heartbeat, authorizedDirs: [] })) });
  });
  r.post('/:id/push-token', (req: Request, res: Response) => {
    dao.updateStatus(req.params.id, 'online');
    res.json({ success: true });
  });
  return r;
}
