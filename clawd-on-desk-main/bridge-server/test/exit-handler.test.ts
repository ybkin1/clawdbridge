import { describe, it, expect } from '@jest/globals';
import { ExitHandler } from '../src/exit-handler';
import { spawn } from 'child_process';

describe('BP09: ExitHandler', () => {
  it('should fire exit event when process exits', (done) => {
    const handler = new ExitHandler();
    const proc = spawn('node', ['-e', 'process.exit(0)']);

    handler.onExitEvent((event) => {
      expect(event.sessionId).toBe('test-session');
      expect(event.exitCode).toBe(0);
      done();
    });

    handler.attach(proc, 'test-session');
  });

  it('should fire cleanup on exit', (done) => {
    const handler = new ExitHandler();
    const proc = spawn('node', ['-e', 'process.exit(0)']);

    handler.onCleanupEvent((sessionId) => {
      expect(sessionId).toBe('cleanup-session');
      done();
    });

    handler.attach(proc, 'cleanup-session');
  });

  it('should report non-zero exit code', (done) => {
    const handler = new ExitHandler();
    const proc = spawn('node', ['-e', 'process.exit(42)']);

    handler.onExitEvent((event) => {
      expect(event.exitCode).toBe(42);
      done();
    });

    handler.attach(proc, 'err-session');
  });

  it('should kill process with SIGTERM then SIGKILL', async () => {
    const handler = new ExitHandler();
    const proc = spawn('node', ['-e', 'setTimeout(()=>{}, 100000)']);

    handler.kill(proc);
    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve());
    });

    expect(proc.killed).toBe(true);
  });
});
