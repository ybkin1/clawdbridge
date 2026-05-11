import { WebSocket } from 'ws';

export class Heartbeat {
  private connections = new Map<string, { ws: WebSocket; lastPong: number }>();
  private onDisconnectCb?: (deviceId: string) => void;

  register(deviceId: string, ws: WebSocket): void { this.connections.set(deviceId, { ws, lastPong: Date.now() }); }
  remove(deviceId: string): void { this.connections.delete(deviceId); }
  setOnDisconnect(cb: (deviceId: string) => void): void { this.onDisconnectCb = cb; }
  handlePong(deviceId: string): void { const c = this.connections.get(deviceId); if (c) c.lastPong = Date.now(); }

  check(): void {
    const now = Date.now();
    for (const [deviceId, c] of this.connections) {
      if (now - c.lastPong > 60000) { c.ws.close(); this.connections.delete(deviceId); this.onDisconnectCb?.(deviceId); }
    }
  }
}
