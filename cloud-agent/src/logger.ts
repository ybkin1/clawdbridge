export const logger = {
  info: (data: { msg: string; ctx?: Record<string, unknown>; reqId?: string }) => console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', ...data })),
  warn: (data: { msg: string; ctx?: Record<string, unknown>; reqId?: string }) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: 'warn', ...data })),
  error: (data: { msg: string; ctx?: Record<string, unknown>; reqId?: string }) => console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', ...data })),
  debug: (data: { msg: string; ctx?: Record<string, unknown>; reqId?: string }) => { if (process.env.NODE_ENV !== 'production') console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'debug', ...data })); },
};
