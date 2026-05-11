import { Router, Request, Response } from 'express';
import { AuthService } from './auth-service';

export interface DeviceRecord {
  id: string;
  name: string;
  platform: string;
  status: 'online' | 'offline';
  authorizedDirs: string[];
  lastHeartbeat?: number;
}

export class DeviceRoutes {
  private devices: DeviceRecord[] = [];
  private auth: AuthService;

  constructor(auth: AuthService) {
    this.auth = auth;
  }

  getRouter(): Router {
    const router = Router();

    router.get('/', this.auth.jwtVerifier.bind(this.auth), (_req: Request, res: Response) => {
      res.json({ devices: this.devices });
    });

    router.post('/pair', this.auth.jwtVerifier.bind(this.auth), (req: Request, res: Response) => {
      const device: DeviceRecord = {
        id: req.body.deviceId || `dev-${Date.now()}`,
        name: req.body.name || 'Unknown',
        platform: req.body.platform || 'unknown',
        status: 'offline',
        authorizedDirs: req.body.authorizedDirs || [],
      };
      this.devices.push(device);
      res.json({ success: true, device });
    });

    router.delete('/:id', this.auth.jwtVerifier.bind(this.auth), (req: Request, res: Response) => {
      this.devices = this.devices.filter((d) => d.id !== req.params.id);
      res.json({ success: true });
    });

    return router;
  }

  getDevices(): DeviceRecord[] {
    return this.devices;
  }
}

export class SessionRoutes {
  private sessions: Array<{
    id: string; title: string; deviceId: string; lastMessageAt: number;
    unreadCount: number; messages: Array<{ id: string; content: string; timestamp: number; type: string }>;
  }> = [];
  private auth: AuthService;

  constructor(auth: AuthService) {
    this.auth = auth;
  }

  getRouter(): Router {
    const router = Router();

    router.get('/', this.auth.jwtVerifier.bind(this.auth), (req: Request, res: Response) => {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const list = this.sessions.map(({ messages, ...rest }) => rest);
      res.json({ sessions: list.slice(offset, offset + limit), total: list.length });
    });

    router.post('/', this.auth.jwtVerifier.bind(this.auth), (req: Request, res: Response) => {
      const session = {
        id: `ses-${Date.now()}`,
        title: req.body.title || '',
        deviceId: req.body.deviceId,
        lastMessageAt: Date.now(),
        unreadCount: 0,
        messages: [],
      };
      this.sessions.push(session);
      res.json({ session: { id: session.id, title: session.title, deviceId: session.deviceId, createdAt: Date.now() } });
    });

    router.get('/:id/messages', this.auth.jwtVerifier.bind(this.auth), (req: Request, res: Response) => {
      const session = this.sessions.find((s) => s.id === req.params.id);
      if (!session) return res.status(404).json({ error: 'session not found' });

      const before = parseInt(req.query.before as string) || Date.now();
      const limit = parseInt(req.query.limit as string) || 50;
      const msgs = session.messages.filter((m) => m.timestamp < before).slice(0, limit);
      res.json({ messages: msgs, hasMore: msgs.length === limit });
    });

    return router;
  }

  addSession(session: { id: string; title: string; deviceId: string; }): void {
    this.sessions.push({ ...session, lastMessageAt: Date.now(), unreadCount: 0, messages: [] });
  }

  getSessions(): typeof this.sessions {
    return this.sessions;
  }
}
