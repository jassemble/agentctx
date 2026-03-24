import { spawn } from 'node:child_process';

export function spawnWithStdin(cmd: string, args: string[], input: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { timeout });
    const chunks: string[] = [];
    const errChunks: string[] = [];
    proc.stdout.on('data', (d) => chunks.push(d.toString()));
    proc.stderr.on('data', (d) => errChunks.push(d.toString()));
    proc.on('close', (code) => {
      if (code === 0) resolve(chunks.join(''));
      else reject(new Error(errChunks.join('') || `Exit code ${code}`));
    });
    proc.on('error', reject);
    proc.stdin.write(input);
    proc.stdin.end();
  });
}
