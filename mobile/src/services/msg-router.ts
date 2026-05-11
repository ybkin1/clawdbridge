export type MsgHandler = (msg: any) => void;

export class MessageRouter {
  private handlers = new Map<string, MsgHandler[]>();

  on(type: string, handler: MsgHandler): void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  off(type: string, handler: MsgHandler): void {
    const list = this.handlers.get(type);
    if (!list) return;
    this.handlers.set(type, list.filter(h => h !== handler));
  }

  dispatch(msg: { type: string; [key: string]: unknown }): void {
    const handlers = this.handlers.get(msg.type) || [];
    for (const h of handlers) h(msg);
  }
}

export const msgRouter = new MessageRouter();
