import express from 'express';
import { reqIdMiddleware } from './middleware/req-id';
import { sanitizeMiddleware } from './middleware/sanitize';
import { helmetMiddleware } from './middleware/helmet';
import { rateLimiterMiddleware } from './middleware/rate-limit';
import { errorHandlerMiddleware } from './middleware/error-handler';
import { jwtVerifierMiddleware } from './middleware/auth';
import { JWTIssuer } from './jwt-issuer';
import { metrics } from './metrics';

export function createApp(jwtIssuer: JWTIssuer, controllers: Record<string, express.Router>) {
  const app = express();
  app.use(reqIdMiddleware);                                  // ①
  app.use(express.json());                                   // ②
  app.use(helmetMiddleware);                                 // ③
  app.use(sanitizeMiddleware);                               // ④
  app.use('/api/v1', jwtVerifierMiddleware(jwtIssuer));       // ⑤
  app.use('/api/v1', rateLimiterMiddleware);                  // ⑥

  app.get('/health', (_req, res) => res.json({ status: 'healthy', uptime: process.uptime(), pm2: { status: 'online' }, claudeProcesses: { total: 0, running: 0, crashed: 0 }, sqlite: { status: 'ok' }, memory: { rssMB: Math.round(process.memoryUsage().rss / 1_048_576) }, disk: { freeGB: 0 }, agent_engine: { status: 'ok' } }));
  app.get('/metrics', (_req, res) => { res.set('Content-Type', 'text/plain'); res.send(metrics.getPrometheusText()); });

  for (const [path, router] of Object.entries(controllers)) { app.use(path, router); }
  app.use(errorHandlerMiddleware);
  return app;
}
