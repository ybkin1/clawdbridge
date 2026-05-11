import { useEffect } from 'react';

export function useOAuthDeepLink(onTokenReceived: (token: string, refreshToken: string) => void): void {
  useEffect(() => {
    const handler = (event: { url: string }) => {
      const url = event.url;
      if (url.startsWith('clawdbridge://auth')) {
        const params = new URLSearchParams(url.replace('clawdbridge://auth?', ''));
        const token = params.get('token');
        const refresh = params.get('refresh');
        if (token && refresh) onTokenReceived(token, refresh);
      }
    };
    return () => {};
  }, [onTokenReceived]);
}
