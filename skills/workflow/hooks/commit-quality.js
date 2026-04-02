// agentctx commit-quality hook (PreToolUse — Bash matcher)
// Validates git commits: conventional format, detects debug statements,
// warns about hardcoded secrets in staged files.

const { execSync } = require('child_process');

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const toolInput = data.tool_input || {};
    const command = (toolInput.command || '').trim();

    // Only check git commit commands
    if (!command.match(/^git\s+commit\b/)) {
      process.stdout.write(input);
      process.exit(0);
      return;
    }

    const warnings = [];
    const errors = [];

    // Check commit message format (conventional commits)
    const msgMatch = command.match(/-m\s+["']([^"']+)["']/);
    if (msgMatch) {
      const msg = msgMatch[1];
      const conventionalPattern = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?:\s.+/;
      if (!conventionalPattern.test(msg)) {
        warnings.push(
          'Commit message does not follow conventional format. ' +
          'Expected: type(scope): description (e.g., feat: add login page)'
        );
      }
      if (msg.length > 72) {
        warnings.push('Commit message subject exceeds 72 characters');
      }
    }

    // Check staged files for debug statements and secrets
    try {
      const staged = execSync('git diff --cached --name-only', {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim().split('\n').filter(Boolean);

      for (const file of staged) {
        if (!/\.(ts|tsx|js|jsx|py)$/.test(file)) continue;

        try {
          const diff = execSync(`git diff --cached -- "${file}"`, {
            encoding: 'utf-8',
            timeout: 5000,
          });

          // Check for debug statements in added lines
          const addedLines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
          for (const line of addedLines) {
            if (/console\.(log|debug|warn)\(/.test(line)) {
              warnings.push(`${file}: contains console.log — remove before committing`);
              break;
            }
            if (/debugger\b/.test(line)) {
              warnings.push(`${file}: contains debugger statement`);
              break;
            }
          }

          // Check for hardcoded secrets
          const secretPatterns = [
            /['"]sk-[a-zA-Z0-9]{20,}['"]/,     // OpenAI
            /['"]ghp_[a-zA-Z0-9]{36}['"]/,       // GitHub
            /['"]AKIA[A-Z0-9]{16}['"]/,           // AWS
            /['"][a-zA-Z0-9+/]{40,}={0,2}['"]/,   // Generic base64 key
          ];
          for (const pattern of secretPatterns) {
            if (pattern.test(diff)) {
              errors.push(`${file}: possible hardcoded secret detected — use environment variables`);
              break;
            }
          }
        } catch { /* ignore per-file errors */ }
      }
    } catch { /* git diff may fail if not in repo */ }

    // Report findings
    if (errors.length > 0) {
      process.stderr.write(
        `[agentctx] BLOCKED commit:\n${errors.map((e) => `  ✗ ${e}`).join('\n')}\n`
      );
      process.exit(2);
      return;
    }

    if (warnings.length > 0) {
      process.stderr.write(
        `[agentctx] Commit warnings:\n${warnings.map((w) => `  ⚠ ${w}`).join('\n')}\n`
      );
    }

    // Allow — pass through
    process.stdout.write(input);
  } catch {
    // On error, allow — don't block
    process.stdout.write(input);
  }
  process.exit(0);
});
