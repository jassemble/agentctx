// agentctx session-end hook
// Auto-updates .agentctx/context/status.md with session summary.
// Reads session transcript info from stdin JSON.

const fs = require('fs');
const path = require('path');

const statusPath = path.join(process.cwd(), '.agentctx', 'context', 'status.md');

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const transcriptPath = data.transcript_path || '';
    const now = new Date().toISOString().split('T')[0];

    // Read existing status
    let existing = '';
    try {
      existing = fs.readFileSync(statusPath, 'utf-8');
    } catch { /* file may not exist yet */ }

    // Extract session info
    const sessionEntry = [
      `## Last Session (${now})`,
      '',
      `*Auto-logged by agentctx session hook*`,
      '',
      transcriptPath ? `Session transcript: \`${transcriptPath}\`` : '',
      '',
    ].filter(Boolean).join('\n');

    // Prepend session entry after the title
    const titleMatch = existing.match(/^#\s+.+$/m);
    let updated;
    if (titleMatch) {
      const titleEnd = existing.indexOf(titleMatch[0]) + titleMatch[0].length;
      updated = existing.slice(0, titleEnd) + '\n\n' + sessionEntry + '\n' + existing.slice(titleEnd).replace(/\n## Last Session \(\d{4}-\d{2}-\d{2}\)[\s\S]*?(?=\n## |\n*$)/, '\n');
    } else {
      updated = '# Project Status\n\n' + sessionEntry + '\n' + existing;
    }

    // Ensure directory exists
    const dir = path.dirname(statusPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(statusPath, updated, 'utf-8');
  } catch {
    // Non-blocking — never fail session end
  }
  process.exit(0);
});
