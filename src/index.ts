import { Command } from 'commander';

const program = new Command();

program
  .name('agentctx')
  .description('Unified agent context management — one source of truth, many AI agent outputs')
  .version('0.1.0');

program
  .command('init [skills...]')
  .description('Initialize .agentctx/ with optional skills')
  .option('--import', 'Auto-import existing context files (non-interactive)')
  .option('--no-interactive', 'Skip interactive prompts, use defaults')
  .option('--force', 'Overwrite existing .agentctx/ directory')
  .option('--scan', 'Also run codebase scan after init')
  .action(async (skills, options) => {
    const { initCommand } = await import('./commands/init.js');
    await initCommand(skills, options);
  });

program
  .command('generate')
  .alias('gen')
  .description('Generate output files from context source')
  .option('--target <name>', 'Generate specific target only')
  .option('--dry-run', 'Print to stdout, don\'t write files')
  .option('--diff', 'Show diff against current output files')
  .option('--strict', 'Error on any warning')
  .option('--verbose', 'Show detailed assembly info')
  .action(async (options) => {
    const { generateCommand } = await import('./commands/generate.js');
    await generateCommand(options);
  });

program
  .command('lint')
  .description('Validate context quality')
  .option('--strict', 'Exit non-zero on warnings')
  .option('--ai', 'Run AI-powered checks using claude CLI')
  .option('--format <format>', 'Output format: text, json, github', 'text')
  .action(async (options) => {
    const { lintCommand } = await import('./commands/lint.js');
    await lintCommand(options);
  });

program
  .command('status')
  .description('Show current context state')
  .action(async () => {
    const { statusCommand } = await import('./commands/status.js');
    await statusCommand();
  });

program
  .command('scan')
  .description('Analyze codebase and suggest/generate context')
  .option('--suggest-skills', 'Only suggest skills, don\'t generate')
  .option('--no-ai', 'Skip AI analysis')
  .action(async (options) => {
    const { scanCommand } = await import('./commands/scan.js');
    await scanCommand(options);
  });

program
  .command('refresh')
  .description('Update context from recent code changes')
  .option('--no-ai', 'Only show what changed, don\'t auto-update')
  .action(async (options) => {
    const { refreshCommand } = await import('./commands/refresh.js');
    await refreshCommand(options);
  });

program
  .command('serve')
  .description('Serve all project markdown files on a local web server')
  .option('-p, --port <port>', 'Port to serve on', '4000')
  .option('--no-open', 'Don\'t open browser automatically')
  .action(async (options) => {
    const { serveCommand } = await import('./commands/serve.js');
    await serveCommand(options);
  });

program.parse();
