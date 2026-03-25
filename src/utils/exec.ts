import { spawn } from 'node:child_process';

export function spawnWithStdin(cmd: string, args: string[], input: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    const chunks: string[] = [];
    const errChunks: string[] = [];
    let settled = false;

    // Manual timeout since spawn's timeout option is unreliable
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }
    }, timeout);

    proc.stdout.on('data', (d) => chunks.push(d.toString()));
    proc.stderr.on('data', (d) => errChunks.push(d.toString()));

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0 || chunks.length > 0) resolve(chunks.join(''));
      else reject(new Error(errChunks.join('') || `Exit code ${code}`));
    });

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    // Write input and close stdin
    proc.stdin.write(input, () => {
      proc.stdin.end();
    });
  });
}
