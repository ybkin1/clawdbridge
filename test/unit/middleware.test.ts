import { describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { jwtVerifierMiddleware } from '../../cloud-agent/src/middleware/auth';
import { rateLimiterMiddleware } from '../../cloud-agent/src/middleware/rate-limit';
import { sanitizeMiddleware } from '../../cloud-agent/src/middleware/sanitize';
import { JWTIssuer } from '../../cloud-agent/src/jwt-issuer';

describe('jwtVerifierMiddleware', () => {
  const jwtIssuer = new JWTIssuer('test-secret');
  const app = express();
  app.use(express.json());
  app.use(jwtVerifierMiddleware(jwtIssuer));
  app.get('/api/v1/test', (req, res) => res.json({ userId: req.userId, deviceId: req.deviceId }));

  it('allows request with valid token', async () => {
    const tokens = jwtIssuer.issueTokenPair({ github_user_id: 123, github_login: 'test', device_id: 'dev-1' });
    const res = await request(app).get('/api/v1/test').set('Authorization', `Bearer ${tokens.token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('123');
  });

  it('rejects missing token', async () => {
    const res = await request(app).get('/api/v1/test');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_004');
  });

  it('rejects invalid token', async () => {
    const res = await request(app).get('/api/v1/test').set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_001');
  });

  it('rejects tampered token', async () => {
    const tokens = jwtIssuer.issueTokenPair({ github_user_id: 123, github_login: 'test', device_id: 'dev-1' });
    const tampered = tokens.token.slice(0, -5) + 'xxxxx';
    const res = await request(app).get('/api/v1/test').set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  it('bypasses health endpoint', async () => {
    const healthApp = express();
    healthApp.use(jwtVerifierMiddleware(jwtIssuer));
    healthApp.get('/health', (req, res) => res.json({ ok: true }));
    const res = await request(healthApp).get('/health');
    expect(res.status).toBe(200);
  });
});

describe('sanitizeMiddleware', () => {
  const app = express();
  app.use(express.json());
  app.use(sanitizeMiddleware);
  app.post('/test', (req, res) => res.json({ body: req.body, query: req.query }));

  it('removes HTML tags from body', async () => {
    const res = await request(app).post('/test').send({ name: '<script>alert(1)</script>hello' });
    expect(res.body.body.name).toBe('hello');
  });

  it('removes HTML tags from query', async () => {
    const res = await request(app).post('/test?q=<b>test</b>');
    expect(res.body.query.q).toBe('test');
  });

  it('sanitizes nested objects', async () => {
    const res = await request(app).post('/test').send({ user: { name: '<p>John</p>' } });
    expect(res.body.body.user.name).toBe('John');
  });
});

describe('rateLimiterMiddleware', () => {
  const app = express();
  app.use((req, res, next) => { (req as any).userId = 'user-1'; next(); });
  app.use(rateLimiterMiddleware);
  app.get('/test', (req, res) => res.json({ ok: true }));

  it('allows requests within limit', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
  });

  it('rate limits after burst', async () => {
    // Make 101 requests quickly
    for (let i = 0; i < 100; i++) {
      await request(app).get('/test');
    }
    const res = await request(app).get('/test');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_001');
  });
});
