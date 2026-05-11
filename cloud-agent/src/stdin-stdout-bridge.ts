import { ClaudeProcess } from './claude-process-pool';
import { ParsedClaudeMessage } from './types/messages';

export type MessageHandler = (msg: ParsedClaudeMessage & { reqId?: string }) => void;

export class StdinStdoutBridge {
  private stdoutBuffer = '';
  private handler: MessageHandler | null = null;

  // 纯聊天模式: 调用方通过 options 控制是否解析 tool_use (F-H05)
  attach(proc: ClaudeProcess, onMessage: MessageHandler, options?: { noTools?: boolean }): void {
    this.handler = onMessage;
    const noTools = options?.noTools ?? false;
    proc.proc.stdout!.on('data', (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString();
      const lines = this.stdoutBuffer.split('\n');
      this.stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line.trim()) as ParsedClaudeMessage;
          if (noTools && parsed.type === 'tool_use') continue; // F-H05: 纯聊天跳过 tool_use
          this.handler?.(parsed);
        } catch { /* non-JSON stdout line, ignore */ }
      }
    });
  }

  write(proc: ClaudeProcess, text: string): boolean { // §14.1 STEP4
    if (proc.state === 'crashed') return false;
    try {
      proc.proc.stdin!.write(text + '\n');
      proc.ringBuffer.push(text);
      if (proc.ringBuffer.length > 200) proc.ringBuffer.shift(); // F-K21: maxLines 200
      return true;
    } catch (e: any) {
      if (e.code === 'EPIPE') { proc.state = 'crashed'; return false; }
      throw e;
    }
  }
}
