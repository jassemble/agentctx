// agentctx observation hook (PostToolUse)
// Captures tool usage to .agentctx/observations.jsonl for continuous learning.
// Lightweight — appends one line per tool call, never blocks.

const fs = require('fs');
const path = require('path');

const obsPath = path.join(process.cwd(), '.agentctx', 'observations.jsonl');

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name || 'unknown';
    const toolInput = data.tool_input || {};

    // Extract key info without storing full content
    const observation = {
      ts: new Date().toISOString(),
      tool: toolName,
      file: toolInput.file_path || toolInput.path || toolInput.command?.slice(0, 100) || null,
      success: data.tool_output ? !data.tool_output.startsWith('Error') : true,
    };

    // Append to observations file (create if missing)
    const dir = path.dirname(obsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(obsPath, JSON.stringify(observation) + '\n', 'utf-8');
  } catch {
    // Non-blocking — never fail tool execution
  }

  // Pass through
  process.stdout.write(input);
  process.exit(0);
});
