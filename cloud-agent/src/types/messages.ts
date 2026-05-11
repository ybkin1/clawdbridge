export type WsMessageType = 'client_connect' | 'session_sync' | 'user_message' | 'assistant_stream' | 'tool_invocation' | 'tool_result' | 'approval_request' | 'approval_response' | 'task_update' | 'error' | 'relay:desktop_online' | 'ping' | 'pong' | 'session_state' | 'batch_approval';

export interface WsEnvelope { type: WsMessageType; sessionId?: string; reqId?: string; seq?: number; payload?: Record<string, unknown>; }

export interface UserMessage extends WsEnvelope { type: 'user_message'; sessionId: string; seq: number; payload: { content: string; contentType?: string; metadata?: Record<string, unknown> }; }

export interface AssistantStream extends WsEnvelope { type: 'assistant_stream'; sessionId: string; payload: { delta: string; done: boolean; messageId: string }; }

export interface ToolInvocation extends WsEnvelope { type: 'tool_invocation'; sessionId: string; payload: { callId: string; toolName: string; toolInput: Record<string,unknown>; filePath?: string; command?: string }; }

export interface ToolResult extends WsEnvelope { type: 'tool_result'; sessionId: string; payload: { callId: string; success: boolean; output?: string; error?: string }; }

export interface ApprovalRequest extends WsEnvelope { type: 'approval_request'; sessionId: string; payload: { requestId: string; operation: string; target: string; risk: 'low'|'medium'|'high'; status?: string }; }

export interface ApprovalResponse extends WsEnvelope { type: 'approval_response'; payload: { requestId: string; decision: 'approved'|'rejected'; scope: 'once'|'session' }; }

export interface TaskUpdate extends WsEnvelope { type: 'task_update'; payload: { taskId: string; status: string; sessionsCount?: number; subtasksCount?: number }; }

export interface WsError extends WsEnvelope { type: 'error'; payload: { code: string; message: string; recoverable?: boolean }; }

export interface ParsedClaudeMessage { type: 'text'|'tool_use'|'permission_request'|'tool_result'; content?: string; name?: string; input?: Record<string,unknown>; callId?: string; success?: boolean; output?: string; error?: string; operation?: string; target?: string; risk?: string; }
