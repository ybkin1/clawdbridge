import { describe, it, expect } from '@jest/globals';
import { StdinWriter } from '../src/stdin-writer';
import { spawn } from 'child_process';

describe('BP06: StdinWriter', () => {
  const writer = new StdinWriter();

  it('should write to process stdin', (done) => {
    const proc = spawn('node', ['-e', 'process.stdin.once("data",d=>{console.log(d.toString().trim());process.exit(0)})']);

    proc.stdout.once('data', (data) => {
      expect(data.toString().trim()).toBe('hello from stdin');
      done();
    });

    writer.write(proc, 'hello from stdin');
  });

  it('should return false if stdin is destroyed', () => {
    const proc = spawn('node', ['-e', 'process.exit(0)']);
    proc.stdin?.destroy();
    expect(writer.write(proc, 'test')).toBe(false);
  });

  it('should return true on successful write', (done) => {
    const proc = spawn('node', ['-e', 'process.stdin.once("data",()=>process.exit(0))']);
    proc.on('exit', () => done());
    expect(writer.write(proc, 'test')).toBe(true);
    proc.stdin?.end();
  });
});
