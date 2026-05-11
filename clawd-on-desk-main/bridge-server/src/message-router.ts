export enum MessageType {
  CLIENT_CONNECT = 'client_connect',
  USER_MESSAGE = 'user_message',
  APPROVAL_RESPONSE = 'approval_response',
  PING = 'ping',
  SESSION_SYNC = 'session_sync',
  ASSISTANT_STREAM = 'assistant_stream',
  TOOL_INVOCATION = 'tool_invocation',
  TOOL_RESULT = 'tool_result',
  APPROVAL_REQUEST = 'approval_request',
  SESSION_STATE = 'session_state',
  ERROR = 'error',
  PONG = 'pong',
}

export interface WSMessage {
  id: string;
  type: MessageType;
  sessionId: string;
  timestamp: number;
  seq: number;
  payload: Record<string, unknown>;
}

type MessageHandler = (msg: WSMessage) => void;

export class MessageRouter {
  private handlers: Map<MessageType, MessageHandler[]> = new Map();

  register(type: MessageType, handler: MessageHandler): void {
    const list = this.handlers.get(type) || [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  route(rawData: string): boolean {
    let msg: WSMessage;

    try {
      msg = JSON.parse(rawData);
    } catch {
      return false;
    }

    if (!msg.type || !msg.id) {
      return false;
    }

    const handlers = this.handlers.get(msg.type as MessageType);
    if (!handlers || handlers.length === 0) {
      return false;
    }

    for (const handler of handlers) {
      handler(msg);
    }

    return true;
  }

  getRegisteredTypes(): MessageType[] {
    return Array.from(this.handlers.keys());
  }

  clear(): void {
    this.handlers.clear();
  }
}
