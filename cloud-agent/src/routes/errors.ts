export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message || code);
    this.name = 'AppError';
  }
}

export function serializeError(err: unknown, reqId: string) {
  if (err instanceof AppError) {
    return { error: err.message, code: err.code, reqId, details: err.details };
  }
  return { error: 'Internal server error', code: 'INTERNAL_001', reqId };
}
