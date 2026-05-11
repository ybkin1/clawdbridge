export interface Message {
  id: string;
  type: 'user' | 'assistant' | 'tool_call' | 'approval' | 'error' | 'system';
  content: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'failed';
  metadata: {
    toolCallId?: string;
    approvalId?: string;
    codeLanguage?: string;
    filePath?: string;
  };
}

export interface ApprovalPayload {
  requestId: string;
  operation: string;
  target: string;
  risk: 'low' | 'medium' | 'high';
}

export interface ChatState {
  messages: Message[];
  inputValue: string;
  isStreaming: boolean;
  pendingApprovals: ApprovalPayload[];

  sendMessage: (content: string) => void;
  receiveStream: (delta: string, done: boolean, messageId: string, sessionId: string) => void;
  handleApproval: (requestId: string, decision: 'approved' | 'rejected') => void;
  markToolResult: (toolCallId: string, result: { success: boolean; output?: string }) => void;
  clearInput: () => void;
  addToolCall: (sessionId: string, payload: { callId: string; toolName: string; filePath?: string }) => void;
  addApprovalRequest: (sessionId: string, payload: ApprovalPayload) => void;
  addError: (sessionId: string, payload: { code: string; message: string }) => void;
}
