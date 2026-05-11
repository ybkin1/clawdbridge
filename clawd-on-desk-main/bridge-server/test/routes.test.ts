import { describe, it, expect, beforeEach } from '@jest/globals';
import { AuthService } from '../src/auth-service';
import { DeviceRoutes, SessionRoutes } from '../src/routes';
import express from 'express';
import request from 'supertest';

describe('BP17+18: Routes', () => {
  const auth = new AuthService('test-secret');
  let deviceRoutes: DeviceRoutes;
  let sessionRoutes: SessionRoutes;
  let app: express.Application;
  let accessToken: string;

  beforeEach(() => {
    const login = auth.handleOAuth('github', 'routes-test-code');
    accessToken = login!.token;
    deviceRoutes = new DeviceRoutes(auth);
    sessionRoutes = new SessionRoutes(auth);

    app = express();
    app.use(express.json());
    app.use('/api/devices', deviceRoutes.getRouter());
    app.use('/api/sessions', sessionRoutes.getRouter());
  });

  it('should return 401 without auth', async () => {
    await request(app).get('/api/devices').expect(401);
  });

  it('should list devices', async () => {
    await request(app).get('/api/devices').set('Authorization', `Bearer ${accessToken}`).expect(200);
  });

  it('should pair and delete device', async () => {
    const res = await request(app)
      .post('/api/devices/pair')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ deviceId: 'dev-1', name: 'MyPC', platform: 'windows' })
      .expect(200);
    expect(res.body.device.name).toBe('MyPC');

    await request(app).delete('/api/devices/dev-1').set('Authorization', `Bearer ${accessToken}`).expect(200);
  });

  it('should list sessions', async () => {
    await request(app).get('/api/sessions').set('Authorization', `Bearer ${accessToken}`).expect(200);
  });

  it('should create session', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ deviceId: 'dev-1', title: 'Test Session' })
      .expect(200);
    expect(res.body.session.title).toBe('Test Session');
  });

  it('should return 404 for nonexistent session messages', async () => {
    await request(app).get('/api/sessions/nonexistent/messages').set('Authorization', `Bearer ${accessToken}`).expect(404);
  });
});
