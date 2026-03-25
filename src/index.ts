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
  .option('--app <path>', 'Initialize for a specific app in a monorepo (e.g., --app apps/backend)')
  .option('--agent <name>', 'Add an AI agent personality (from Agency Agents)')
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
  .command('sync')
  .description('Keep context current — validate modules, update skills, regenerate outputs')
  .option('--add <skills...>', 'Add new skills')
  .option('--agent <name>', 'Add an AI agent personality (from Agency Agents)')
  .option('--no-ai', 'Skip AI validation')
  .action(async (options) => {
    const { syncCommand } = await import('./commands/sync.js');
    await syncCommand(options);
  });

program
  .command('refresh')
  .description('Update context from recent git changes (use sync for full update)')
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

program
  .command('doctor')
  .description('Check setup health and get personalized recommendations')
  .action(async () => {
    const { doctorCommand } = await import('./commands/doctor.js');
    await doctorCommand();
  });

program
  .command('update')
  .description('Update installed skills to latest versions')
  .option('--dry-run', 'Show what would change without applying')
  .action(async (options) => {
    const { updateCommand } = await import('./commands/update.js');
    await updateCommand(options);
  });

program
  .command('agents <action> [name]')
  .description('Browse and manage AI agent personalities')
  .option('--all', 'Show all agents from agency-agents repo (not just bundled)')
  .action(async (action, name, options) => {
    const { agentsCommand } = await import('./commands/agents.js');
    await agentsCommand(action, name, options);
  });

program.parse();
