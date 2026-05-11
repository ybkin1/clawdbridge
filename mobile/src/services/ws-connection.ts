export type WsMessageHandler = (msg: unknown) => void;

export class WsConnection {
  private ws: WebSocket | null = null;
  private url: string = '';
  private token: string = '';
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelays = [2000, 5000, 15000, 30000, 60000];
  private handler: WsMessageHandler | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  setMessageHandler(handler: WsMessageHandler): void {
    this.handler = handler;
  }

  connect(url: string, token: string): void {
    this.url = url;
    this.token = token;
    this.doConnect();
  }

  private doConnect(): void {
    this.ws = new WebSocket(`${this.url}?token=${this.token}`);
    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };
    this.ws.onmessage = (event: MessageEvent) => {
      try {
        this.handler?.(JSON.parse(event.data as string));
      } catch (e) {
        console.warn('[WsConnection] malformed message:', event.data, e);
      }
    };
    this.ws.onclose = () => this.scheduleReconnect();
    this.ws.onerror = () => {
      // Error will trigger onclose, which handles reconnect
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // prevent reconnect
    this.ws?.close();
    this.ws = null;
  }

  send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }
    const delay =
      this.reconnectDelays[this.reconnectAttempts] ??
      this.reconnectDelays[this.reconnectDelays.length - 1];
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      if (this.url && this.token) {
        this.doConnect();
      }
    }, delay);
  }
}

let instance: WsConnection;

export function getWsConnection(): WsConnection {
  if (!instance) {
    instance = new WsConnection();
  }
  return instance;
}
