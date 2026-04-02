// agentctx session-start hook
// Loads .agentctx/context/status.md on session start so Claude has context
// from the previous session without manual reading.

const fs = require('fs');
const path = require('path');

const statusPath = path.join(process.cwd(), '.agentctx', 'context', 'status.md');

try {
  if (fs.existsSync(statusPath)) {
    const content = fs.readFileSync(statusPath, 'utf-8');
    if (content.trim().length > 0) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          additionalContext: [
            '## Previous Session Context',
            '',
            content.trim(),
            '',
            '---',
            '*Loaded automatically by agentctx session hook. Update status.md at end of session.*',
          ].join('\n'),
        },
      }));
    }
  }
} catch {
  // Non-blocking — never fail session start
  process.exit(0);
}
