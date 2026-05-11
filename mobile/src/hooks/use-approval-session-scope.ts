import { useState, useCallback } from 'react';

export interface UseSessionScopeReturn {
  isSessionScope: boolean;
  toggleSessionScope: () => void;
}

export function useApprovalSessionScope(): UseSessionScopeReturn {
  const [isSessionScope, setIsSessionScope] = useState(false);
  const toggleSessionScope = useCallback(() => setIsSessionScope((s) => !s), []);
  return { isSessionScope, toggleSessionScope };
}
