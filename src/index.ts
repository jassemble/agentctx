import { Command } from 'commander';

const program = new Command();

program
  .name('agentctx')
  .description('AI Development Framework — context, workflow, agents')
  .version('0.1.0');

// ── Setup ─────────────────────────────────────────────────────────────

program
  .command('init [skills...]')
  .description('Initialize .agentctx/ with optional skills')
  .option('--force', 'Overwrite existing .agentctx/ directory')
  .option('--app <path>', 'Initialize for a specific app in a monorepo')
  .option('--agent <name>', 'Add AI agent personality (comma-separated for multiple)')
  .action(async (skills, options) => {
    const { initCommand } = await import('./commands/init.js');
    await initCommand(skills, options);
  });

program
  .command('add <items...>')
  .description('Add skills or agents to an existing project')
  .action(async (items) => {
    const { addCommand } = await import('./commands/add.js');
    await addCommand(items);
  });

program
  .command('update')
  .description('Update installed skills and commands to latest versions')
  .option('--dry-run', 'Show what would change without applying')
  .action(async (options) => {
    const { updateCommand } = await import('./commands/update.js');
    await updateCommand(options);
  });

// ── Generate & Lint ───────────────────────────────────────────────────

program
  .command('generate')
  .alias('gen')
  .description('Regenerate output files (CLAUDE.md, .cursorrules, etc.)')
  .option('--target <name>', 'Generate specific target only')
  .option('--dry-run', 'Print to stdout, don\'t write files')
  .option('--diff', 'Show diff against current output files')
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

// ── Info ──────────────────────────────────────────────────────────────

program
  .command('doctor')
  .description('Health check — project status, recommendations, score')
  .action(async () => {
    const { doctorCommand } = await import('./commands/doctor.js');
    await doctorCommand();
  });

program
  .command('agents [action] [name]')
  .description('Browse AI agent personalities (156 bundled from Agency Agents)')
  .action(async (action, name) => {
    const { agentsCommand } = await import('./commands/agents.js');
    await agentsCommand(action || 'list', name);
  });

program
  .command('impeccable [action] [name]')
  .description('Manage Impeccable design skills (impeccable.style)')
  .action(async (action, name) => {
    const { impeccableCommand } = await import('./commands/impeccable.js');
    await impeccableCommand(action || 'list', name);
  });

// ── UI ────────────────────────────────────────────────────────────────

program
  .command('dashboard')
  .alias('ui')
  .description('Project dashboard — specs board, modules, health, activity')
  .option('-p, --port <port>', 'Port to serve on', '4000')
  .option('--no-open', 'Don\'t open browser automatically')
  .action(async (options) => {
    const { dashboardCommand } = await import('./commands/dashboard.js');
    await dashboardCommand(options);
  });

program.parse();
