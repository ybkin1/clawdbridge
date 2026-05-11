import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CLISpawn } from '../src/cli-spawn';
import { existsSync } from 'fs';
import { join } from 'path';

const CLAUDE_AVAILABLE = existsSync(
  join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
);

describe('BP05: CLISpawn', () => {
  let origKey: string | undefined;

  beforeEach(() => { origKey = process.env.ANTHROPIC_API_KEY; });
  afterEach(() => { if (origKey) process.env.ANTHROPIC_API_KEY = origKey; else delete process.env.ANTHROPIC_API_KEY; });

  it('should validate: workDir required', () => {
    const cli = new CLISpawn('sk-test');
    expect(cli.validateSpawnArgs('')).toBe('workDir is required');
    expect(cli.validateSpawnArgs('   ')).toBe('workDir is required');
  });

  it('should validate: API key required', () => {
    const cli = new CLISpawn('');
    expect(cli.validateSpawnArgs('/some/dir')).toBe('ANTHROPIC_API_KEY is not set');
  });

  it('should pass validation when both present', () => {
    const cli = new CLISpawn('sk-test');
    expect(cli.validateSpawnArgs('/home/user/project')).toBeNull();
  });

  it('should use env ANTHROPIC_API_KEY when constructor arg is empty', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const cli = new CLISpawn();
    expect(cli.validateSpawnArgs('/tmp')).toBeNull();
  });

  it('should accept API key from constructor', () => {
    const cli = new CLISpawn('sk-explicit-key');
    expect(cli.validateSpawnArgs('/tmp')).toBeNull();
  });

  it('should fallback to empty key when neither env nor arg provided', () => {
    delete process.env.ANTHROPIC_API_KEY;
    const cli = new CLISpawn();
    expect(cli.validateSpawnArgs('/tmp')).toBe('ANTHROPIC_API_KEY is not set');
  });

  (CLAUDE_AVAILABLE ? it : it.skip)('🔴 LIVE: spawn Claude with prompt, verify process spawns and exits', async () => {
    const cli = new CLISpawn(undefined, 0.05);
    const proc = cli.spawn(process.cwd(), 'Say exactly LIVE_CLI_TEST_OK');

    const lines: string[] = [];
    proc.stdout?.on('data', (chunk: Buffer) => lines.push(chunk.toString()));
    proc.stderr?.on('data', (chunk: Buffer) => lines.push('STDERR:' + chunk.toString()));

    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve());
      setTimeout(() => { proc.kill(); resolve(); }, 30000);
    });

    expect(lines.join(' ')).toContain('LIVE_CLI_TEST_OK');
  }, 60000);
});
