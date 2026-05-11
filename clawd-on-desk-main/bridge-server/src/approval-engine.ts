export interface ApprovalPayload {
  requestId: string;
  sessionId: string;
  operation: string;
  target: string;
  risk: 'low' | 'medium' | 'high';
  details?: string;
}

export class ApprovalWhitelist {
  private allowed: Map<string, Set<string>> = new Map();

  add(sessionId: string, operation: string): void {
    const ops = this.allowed.get(sessionId) || new Set();
    ops.add(operation);
    this.allowed.set(sessionId, ops);
  }

  isAllowed(sessionId: string, operation: string, target?: string): boolean {
    const ops = this.allowed.get(sessionId);
    if (!ops) return false;
    return ops.has(operation) || ops.has(`${operation}:${target}`);
  }

  clearSession(sessionId: string): void {
    this.allowed.delete(sessionId);
  }

  clear(): void {
    this.allowed.clear();
  }
}

export type ApprovalDecision = 'approved' | 'rejected' | 'auto_rejected';

export type ApprovalResponder = {
  resolve: (decision: ApprovalDecision) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class ApprovalWaiter {
  private pending: Map<string, ApprovalResponder> = new Map();

  wait(requestId: string, timeoutMs: number = 60000): Promise<ApprovalDecision> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve('auto_rejected');
      }, timeoutMs);

      this.pending.set(requestId, { resolve, timer });
    });
  }

  resolve(requestId: string, decision: 'approved' | 'rejected'): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;

    clearTimeout(entry.timer);
    entry.resolve(decision);
    this.pending.delete(requestId);
    return true;
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  clear(): void {
    this.pending.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.resolve('auto_rejected');
    });
    this.pending.clear();
  }
}

export class ApprovalInterceptor {
  private whitelist: ApprovalWhitelist;
  private waiter: ApprovalWaiter;
  private onRequest: ((payload: ApprovalPayload) => void) | null = null;

  constructor() {
    this.whitelist = new ApprovalWhitelist();
    this.waiter = new ApprovalWaiter();
  }

  async intercept(sessionId: string, operation: string, target: string, risk: 'low'|'medium'|'high' = 'medium', details?: string): Promise<ApprovalDecision> {
    if (this.whitelist.isAllowed(sessionId, operation, target)) {
      return 'approved';
    }

    const requestId = `req-${sessionId}-${Date.now()}`;
    const payload: ApprovalPayload = { requestId, sessionId, operation, target, risk, details };

    if (this.onRequest) {
      this.onRequest(payload);
    }

    return this.waiter.wait(requestId, 60000);
  }

  addToWhitelist(sessionId: string, operation: string, target?: string): void {
    const key = target ? `${operation}:${target}` : operation;
    this.whitelist.add(sessionId, key);
  }

  onRequestHandler(handler: (payload: ApprovalPayload) => void): void {
    this.onRequest = handler;
  }

  resolve(requestId: string, decision: 'approved' | 'rejected'): boolean {
    return this.waiter.resolve(requestId, decision);
  }

  getWaiter(): ApprovalWaiter {
    return this.waiter;
  }

  getWhitelist(): ApprovalWhitelist {
    return this.whitelist;
  }

  clear(): void {
    this.whitelist.clear();
    this.waiter.clear();
  }
}
