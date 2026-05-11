import { describe, it, expect } from '@jest/globals';
import { StdoutParser } from '../src/stdout-parser';

describe('BP07: StdoutParser', () => {
  let parser: StdoutParser;

  beforeEach(() => {
    parser = new StdoutParser();
  });

  it('should parse text message from Claude stdout', () => {
    const msgs = parser.parse('s1', Buffer.from('{"content":"hello world"}\n'));
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe('text');
    expect(msgs[0].content).toContain('hello world');
  });

  it('should classify tool_use messages', () => {
    const msgs = parser.parse('s1', Buffer.from('{"type":"tool_use","name":"edit_file","input":{"path":"x.ts"}}\n'));
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe('tool_use');
  });

  it('should classify permission_request messages', () => {
    const msgs = parser.parse('s1', Buffer.from('{"type":"permission_request","operation":"write_file","path":"/etc/hosts"}\n'));
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe('permission_request');
  });

  it('should buffer incomplete lines and parse on next chunk', () => {
    const msgs1 = parser.parse('s1', Buffer.from('{"content":"first"}\n{"content":"partial...'));
    expect(msgs1).toHaveLength(1);

    const msgs2 = parser.parse('s1', Buffer.from('end"}\n'));
    expect(msgs2).toHaveLength(1);
  });

  it('should skip non-JSON lines', () => {
    const msgs = parser.parse('s1', Buffer.from('not json\n{"content":"valid"}\n'));
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe('text');
  });

  it('should skip empty lines', () => {
    const msgs = parser.parse('s1', Buffer.from('\n\n{"content":"hello"}\n\n'));
    expect(msgs).toHaveLength(1);
  });

  it('should handle multiple lines in one chunk', () => {
    const chunk = '{"content":"line1"}\n{"type":"tool_use","name":"read"}\n{"content":"line3"}\n';
    const msgs = parser.parse('s1', Buffer.from(chunk));
    expect(msgs).toHaveLength(3);
  });

  it('should clear buffer for session', () => {
    parser.parse('s1', Buffer.from('{"content":"partial'));
    parser.clearBuffer('s1');
    const msgs = parser.parse('s1', Buffer.from('end"}\n'));
    expect(msgs).toHaveLength(0);
  });

  it('should classify tool_result messages', () => {
    const msgs = parser.parse('s1', Buffer.from('{"type":"tool_result","success":true}\n'));
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe('tool_result');
  });
});
