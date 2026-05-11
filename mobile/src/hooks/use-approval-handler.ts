import { useState, useCallback, useRef, useEffect } from 'react';

interface ApprovalRequestPayload { requestId: string; operation: string; target: string; risk: 'low' | 'medium' | 'high'; details?: string; }

export interface UseApprovalHandlerReturn {
  request: ApprovalRequestPayload | null;
  respond: (decision: 'approved' | 'rejected', scope: 'once' | 'session') => void;
  dismiss: () => void;
  isExpired: boolean;
}

export function useApprovalHandler(pendingQueue: unknown[], onRespond: (requestId: string, decision: string, scope: string) => void): UseApprovalHandlerReturn {
  const [request, setRequest] = useState<ApprovalRequestPayload | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pendingQueue.length > 0 && !request) {
      const next = pendingQueue[0] as ApprovalRequestPayload;
      setRequest(next);
      setIsExpired(false);
      timerRef.current = setTimeout(() => { setIsExpired(true); setRequest(null); }, 60000);
    }
  }, [pendingQueue, request]);

  const respond = useCallback((decision: 'approved' | 'rejected', scope: 'once' | 'session') => {
    if (!request) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    onRespond(request.requestId, decision, scope);
    setRequest(null);
  }, [request, onRespond]);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setRequest(null);
  }, []);

  return { request, respond, dismiss, isExpired };
}
