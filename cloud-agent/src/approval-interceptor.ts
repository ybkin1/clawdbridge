import { v4 as uuid } from 'uuid';

interface ApprovalEntry {
  requestId: string; sessionId: string; operation: string; target: string;
  risk: 'low' | 'medium' | 'high'; status: 'pending' | 'approved' | 'rejected' | 'auto_rejected';
  timestamp: number; resolve: (decision: string) => void; timer: NodeJS.Timeout;
}

export class ApprovalWhitelist {
  private whitelist = new Map<string, Set<string>>();
  add(sessionId: string, operation: string): void {
    if (!this.whitelist.has(sessionId)) this.whitelist.set(sessionId, new Set());
    this.whitelist.get(sessionId)!.add(operation);
  }
  check(sessionId: string, operation: string): boolean {
    return this.whitelist.get(sessionId)?.has(operation) ?? false;
  }
  clear(sessionId: string): void { this.whitelist.delete(sessionId); }
}

export class ApprovalWaiter {
  private pending = new Map<string, ApprovalEntry>();
  wait(requestId: string, timeoutMs: number): Promise<'approved' | 'rejected' | 'auto_rejected'> {
    return new Promise((resolve) => {
      const entry: ApprovalEntry = {
        requestId, sessionId: '', operation: '', target: '', risk: 'low',
        status: 'pending', timestamp: Date.now(), resolve,
        timer: setTimeout(() => { entry.status = 'auto_rejected'; resolve('auto_rejected'); }, timeoutMs),
      };
      this.pending.set(requestId, entry);
    });
  }
  resolve(requestId: string, decision: string): void {
    const entry = this.pending.get(requestId);
    if (!entry) return; // F-K15: 超时已清理
    clearTimeout(entry.timer);
    entry.status = decision as 'approved' | 'rejected';
    entry.resolve(decision);
  }
  getPendingCount(): number { return this.pending.size; }
  getPendingForDevice(deviceId: string): ApprovalEntry[] { return []; } // stub
}

export class ApprovalInterceptor {
  private whitelist = new ApprovalWhitelist();
  private waiter = new ApprovalWaiter();
  private onSendToDevice: (deviceId: string, msg: unknown) => void;

  constructor(onSendToDevice: (deviceId: string, msg: unknown) => void) {
    this.onSendToDevice = onSendToDevice;
  }

  async intercept(sessionId: string, operation: string, target: string, risk: string, deviceId: string): Promise<'approved' | 'rejected' | 'auto_rejected'> {
    if (this.whitelist.check(sessionId, operation)) return 'approved';
    const requestId = uuid();
    this.onSendToDevice(deviceId, { type: 'approval_request', payload: { requestId, operation, target, risk, sessionId } });
    const decision = await this.waiter.wait(requestId, 60000);
    return decision;
  }

  addToWhitelist(sessionId: string, operation: string): void { this.whitelist.add(sessionId, operation); }
  resolveApproval(requestId: string, decision: string): void { this.waiter.resolve(requestId, decision); }
}
