// agentctx config-protection hook (PreToolUse — Write matcher)
// Blocks modifications to linter/formatter config files.
// Forces Claude to fix source code instead of weakening rules.

const path = require('path');

const PROTECTED_PATTERNS = [
  '.eslintrc',
  'eslint.config',
  '.prettierrc',
  'prettier.config',
  'biome.json',
  'biome.jsonc',
  '.stylelintrc',
  '.ruff.toml',
  'ruff.toml',
  'pyproject.toml',  // Only block if editing [tool.ruff] section
  '.markdownlint',
  '.shellcheckrc',
];

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const toolInput = data.tool_input || {};
    const filePath = toolInput.file_path || toolInput.path || '';

    if (!filePath) {
      process.stdout.write(input);
      process.exit(0);
      return;
    }

    const filename = path.basename(filePath);
    const isProtected = PROTECTED_PATTERNS.some((pattern) =>
      filename.startsWith(pattern) || filename === pattern
    );

    if (isProtected) {
      process.stderr.write(
        `[agentctx] BLOCKED: Cannot modify ${filename}. ` +
        `Fix the source code instead of changing linter/formatter config. ` +
        `If this is intentional, remove the config-protection hook.\n`
      );
      process.exit(2); // Exit 2 = block the tool execution
      return;
    }

    // Allow — pass through
    process.stdout.write(input);
  } catch {
    // On parse error, allow — don't block
    process.stdout.write(input);
  }
  process.exit(0);
});
