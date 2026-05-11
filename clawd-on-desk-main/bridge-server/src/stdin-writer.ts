import { ChildProcess } from 'child_process';

export class StdinWriter {
  write(proc: ChildProcess, data: string): boolean {
    if (!proc.stdin || proc.stdin.destroyed) return false;
    try {
      proc.stdin.write(data + '\n');
      return true;
    } catch {
      return false;
    }
  }
}
