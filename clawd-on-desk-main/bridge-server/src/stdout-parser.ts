export type ClaudeMsgType = 'text' | 'tool_use' | 'tool_result' | 'permission_request';

export interface ParsedClaudeMessage {
  type: ClaudeMsgType;
  content: string;
  sessionId: string;
  raw: string;
}

export class StdoutParser {
  private lineBuffer: Map<string, string> = new Map();

  parse(sessionId: string, chunk: Buffer): ParsedClaudeMessage[] {
    const results: ParsedClaudeMessage[] = [];
    const data = (this.lineBuffer.get(sessionId) || '') + chunk.toString();
    const lines = data.split('\n');

    this.lineBuffer.set(sessionId, lines.pop() || '');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const parsed = JSON.parse(line);
        const msg: ParsedClaudeMessage = {
          type: this.classify(parsed),
          content: line,
          sessionId,
          raw: line,
        };
        results.push(msg);
      } catch {
        continue;
      }
    }

    return results;
  }

  clearBuffer(sessionId: string): void {
    this.lineBuffer.delete(sessionId);
  }

  private classify(parsed: Record<string, unknown>): ClaudeMsgType {
    if (parsed.type === 'tool_use') return 'tool_use';
    if (parsed.type === 'tool_result') return 'tool_result';
    if (parsed.type === 'permission_request') return 'permission_request';
    if (typeof parsed.content === 'string' || typeof parsed.text === 'string') return 'text';
    return 'text';
  }
}
