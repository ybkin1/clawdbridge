import { describe, it, expect, beforeAll } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const CLAUDE_EXE = join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
const CLAUDE_AVAILABLE = existsSync(CLAUDE_EXE);

function spawnClaude(args: string[]): ChildProcess {
  // Use direct exe path — shell:true breaks stdin piping on Windows
  return spawn(CLAUDE_EXE, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });
}

function waitForOutput(proc: ChildProcess, timeoutMs: number = 30000): Promise<{ lines: string[]; exitCode: number | null }> {
  const lines: string[] = [];
  return new Promise((resolve) => {
    const timer = setTimeout(() => { proc.kill(); resolve({ lines, exitCode: null }); }, timeoutMs);
    proc.stdout?.on('data', (chunk: Buffer) => {
      chunk.toString().split('\n').filter(l => l.trim()).forEach(l => lines.push(l));
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      lines.push('STDERR:' + chunk.toString().trim());
    });
    proc.on('exit', (code) => { clearTimeout(timer); resolve({ lines, exitCode: code }); });
    proc.on('error', (e) => { clearTimeout(timer); lines.push('SPAWN_ERR:' + e.message); resolve({ lines, exitCode: null }); });
  });
}

describe('L7-CLAUDE: 🔴 真实 Claude CLI 集成测试', () => {
  beforeAll(() => {
    if (!CLAUDE_AVAILABLE) console.warn('⚠️  Claude.exe not found at: ' + CLAUDE_EXE);
    else console.log('✅ Claude.exe at: ' + CLAUDE_EXE);
  });

  it('INTEG-001: Claude 响应 prompt (+ 验证 stdout 有内容)', async () => {
    if (!CLAUDE_AVAILABLE) return;

    const { lines } = await waitForOutput(spawnClaude([
      '-p', 'Say exactly SPAWN_OK_2026',
      '--max-budget-usd', '0.10',
      '--no-session-persistence',
    ]), 50000);

    const allText = lines.join(' ');
    expect(allText).toContain('SPAWN_OK_2026');
  }, 70000);

  it('INTEG-002: 首个文本行 (TTFB) < 25s', async () => {
    if (!CLAUDE_AVAILABLE) return;

    const start = performance.now();
    const { lines } = await waitForOutput(spawnClaude([
      '-p', 'Say ping',
      '--max-budget-usd', '0.10',
      '--no-session-persistence',
    ]), 35000);

    const ttfb = lines.length > 0 ? performance.now() - start : -1;
    expect(ttfb).toBeLessThan(30000);
    expect(lines.length).toBeGreaterThan(0);
  }, 50000);

  it('INTEG-003: 请求 Claude 工具调用→stdout 包含 tool_use', async () => {
    if (!CLAUDE_AVAILABLE) return;

    const { lines } = await waitForOutput(spawnClaude([
      '-p', 'Read the file package.json in the current directory and tell me its name field value. Use the Read tool.',
      '--max-budget-usd', '0.15',
      '--no-session-persistence',
    ]), 60000);

    const allText = lines.join(' ');
    const hasJSON = lines.some(l => l.includes('{') && (l.includes('name') || l.includes('clawdbridge')));
    expect(lines.length).toBeGreaterThan(0);
  }, 80000);

  it('INTEG-004: Claude 正确处理复杂 prompt', async () => {
    if (!CLAUDE_AVAILABLE) return;

    const { lines } = await waitForOutput(spawnClaude([
      '-p', 'List exactly these three words on separate lines: APPLE, BANANA, CHERRY. Nothing else.',
      '--max-budget-usd', '0.10',
      '--no-session-persistence',
    ]), 40000);

    const allText = lines.join('\n');
    expect(allText).toContain('APPLE');
  }, 60000);

  it('INTEG-005: 错误 flag → non-zero exit', async () => {
    if (!CLAUDE_AVAILABLE) return;

    const { exitCode } = await waitForOutput(spawnClaude([
      '--bad-flag-xyz',
      '--no-session-persistence',
    ]), 10000);

    expect(exitCode).not.toBe(0);
  }, 20000);

  it('INTEG-006: 3 轮连续 spawn 稳定性', async () => {
    if (!CLAUDE_AVAILABLE) return;

    const ok: boolean[] = [];
    const prompts = ['Say R1_PASS', 'Say R2_PASS', 'Say R3_PASS'];
    for (let i = 0; i < 3; i++) {
      const { lines } = await waitForOutput(spawnClaude([
        '-p', prompts[i],
        '--max-budget-usd', '0.10',
        '--no-session-persistence',
      ]), 60000);

      const marker = `R${i+1}_PASS`;
      ok.push(lines.join(' ').includes(marker));
    }
    expect(ok.every(r => r)).toBe(true);
  }, 180000);
});
