import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { IncomingMessage } from 'http';

export interface WSServerOptions {
  port: number;
  jwtSecret: string;
}

type WSHandler = (ws: WebSocket, req: IncomingMessage) => void;

export class WSServer {
  private wss: WebSocketServer | null = null;
  private port: number;
  private connections: Map<string, WebSocket> = new Map();
  private onConnectHandler: WSHandler | null = null;

  constructor(options: WSServerOptions) {
    this.port = options.port;
  }

  listen(server?: HttpServer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (server) {
        this.wss = new WebSocketServer({ server });
      } else {
        this.wss = new WebSocketServer({ port: this.port });
      }

      this.wss.on('listening', () => resolve());

      this.wss.on('error', (err) => {
        reject(err);
      });

      this.wss.on('connection', (ws, req) => {
        const clientId = this.extractClientId(req);
        this.connections.set(clientId, ws);

        ws.on('close', () => {
          this.connections.delete(clientId);
        });

        ws.on('error', () => {
          this.connections.delete(clientId);
        });

        if (this.onConnectHandler) {
          this.onConnectHandler(ws, req);
        }
      });
    });
  }

  onConnect(handler: WSHandler): void {
    this.onConnectHandler = handler;
  }

  send(clientId: string, data: object): boolean {
    const ws = this.connections.get(clientId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    ws.send(JSON.stringify(data));
    return true;
  }

  broadcastToSession(sessionId: string, data: object): void {
    const msg = JSON.stringify(data);
    this.connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    });
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  close(): void {
    if (this.wss) {
      this.wss.close();
    }
    this.connections.clear();
  }

  private extractClientId(req: IncomingMessage): string {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    return url.searchParams.get('device_id') || `anon-${Date.now()}`;
  }
}
