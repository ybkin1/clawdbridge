import { MessageType, WSMessage } from './ws-connection';
import { WSSender } from './ws-sender';

type TypeHandler = (sessionId: string, payload: Record<string, unknown>) => void;

const ROUTE_TABLE: Partial<Record<MessageType, TypeHandler>> = {};

export function registerRoute(type: MessageType, handler: TypeHandler): void {
  ROUTE_TABLE[type] = handler;
}

export function dispatch(sessionId: string, type: MessageType, payload: Record<string, unknown>): void {
  const handler = ROUTE_TABLE[type];
  if (handler) handler(sessionId, payload);
}

export class WSReceiver {
  onMessage(rawData: string): void {
    let msg: WSMessage;
    try { msg = JSON.parse(rawData); } catch { return; }
    if (!msg.type || !msg.sessionId) return;
    WSSender.handleAck(msg.sessionId, msg.seq);
    const handler = ROUTE_TABLE[msg.type as MessageType];
    if (handler) handler(msg.sessionId, msg.payload);
  }
}

export { ROUTE_TABLE };
