import { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { JWTIssuer } from './jwt-issuer';
import { logger } from './logger';
import { v4 as uuid } from 'uuid';
import { SessionManager } from './session-manager';

const HEARTBEAT_INTERVAL_MS = 30000;   // 30s
const HEARTBEAT_TIMEOUT_MS = 60000;    // 60s
const MAX_CONNECTIONS = 10;            // F-K18
const MAX_PAYLOAD_BYTES = 1_048_576;   // 1MB

export class WSServer {
  private wss: WebSocketServer;
  private connections = new Map<string, WebSocket>(); // deviceId → ws
  private heartbeat = new Map<string, number>();       // deviceId → lastPong
  private readonly maxConnections = MAX_CONNECTIONS;

  constructor(private jwtIssuer: JWTIssuer, private sessionMgr: SessionManager) {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
    setInterval(() => this.pingAll(), HEARTBEAT_INTERVAL_MS);
  }

  handleUpgrade(req: IncomingMessage, socket: any, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url!, 'https://placeholder');
    const token = url.searchParams.get('token');
    if (!token) { ws.close(4001, 'Unauthorized'); return; }
    const payload = this.jwtIssuer.verify(token);
    if (!payload) { ws.close(4001, 'Unauthorized'); return; }

    if (this.connections.size >= this.MAX_CONNECTIONS) { ws.close(4001, 'Connection limit reached'); return; }

    // Close existing connection for same device_id to prevent orphan connections
    const existing = this.connections.get(payload.device_id);
    if (existing) {
      logger.info({ msg: 'ws_replace_connection', ctx: { device_id: payload.device_id } });
      existing.close(4002, 'Replaced by new connection');
    }

    this.connections.set(payload.device_id, ws);
    this.heartbeat.set(payload.device_id, Date.now());

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const reqId = uuid();
        logger.info({ msg: 'ws_in', ctx: { reqId, type: msg.type, device_id: payload.device_id } });
        if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong', serverTime: Date.now() })); this.heartbeat.set(payload.device_id, Date.now()); }
        else if (msg.type === 'client_connect') { const sessions = this.sessionMgr.listByTask(''); ws.send(JSON.stringify({ type: 'session_sync', payload: { sessions, serverTime: Date.now() } })); }
      } catch (e) {
        logger.error({ msg: 'ws_parse_error', ctx: { error: String(e), device_id: payload.device_id } });
      }
    });

    ws.on('close', () => {
      // Only delete if this ws is still the current one (not replaced)
      if (this.connections.get(payload.device_id) === ws) {
        this.connections.delete(payload.device_id);
        this.heartbeat.delete(payload.device_id);
      }
    });
  }

  sendToDevice(deviceId: string, message: unknown): void {
    const ws = this.connections.get(deviceId);
    if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(message)); }
  }

  private pingAll(): void {
    const now = Date.now();
    for (const [deviceId, lastPong] of this.heartbeat) {
      if (now - lastPong > HEARTBEAT_TIMEOUT_MS) {
        this.connections.get(deviceId)?.close();
        this.connections.delete(deviceId);
        this.heartbeat.delete(deviceId);
      } else {
        this.connections.get(deviceId)?.send(JSON.stringify({ type: 'ping' }));
      }
    }
  }
}
