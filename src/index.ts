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
  .option('--strict', 'Exit non-zero on token budget exceeded')
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
  .command('test')
  .description('Test convention compliance via promptfoo (requires: npm i -g promptfoo)')
  .option('--generate', 'Only generate test config, don\'t run')
  .option('--ci', 'CI mode — exit 1 on failures, no cache')
  .action(async (options) => {
    const { testCommand } = await import('./commands/test.js');
    await testCommand(options);
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
  .description('Browse AI agent personalities (155 bundled from Agency Agents)')
  .option('--all', 'Show all agents without division grouping')
  .action(async (action, name, options) => {
    const { agentsCommand } = await import('./commands/agents.js');
    await agentsCommand(action || 'list', name, options);
  });

// ── Learning ─────────────────────────────────────────────────────────

program
  .command('learn')
  .description('Extract patterns from recent sessions into instincts')
  .option('--dry-run', 'Show what would be extracted without saving')
  .action(async (options) => {
    const { learnCommand } = await import('./commands/learn.js');
    await learnCommand(options);
  });

program
  .command('evolve')
  .description('Promote proven instincts into convention updates')
  .option('--threshold <n>', 'Minimum confidence to promote (0-1)', '0.7')
  .option('--dry-run', 'Show report without writing changes')
  .action(async (options) => {
    const { evolveCommand } = await import('./commands/evolve.js');
    await evolveCommand({ ...options, threshold: parseFloat(options.threshold) });
  });

// ── Scan ─────────────────────────────────────────────────────────────

program
  .command('scan')
  .description('Analyze codebase — detect stack, generate context modules')
  .option('--ai', 'Run AI analysis (architecture, patterns, style modules via Claude CLI)')
  .option('--suggest-skills', 'Only show skill suggestions')
  .option('--deep', 'Generate code map (API routes, hooks, services, call graph)')
  .option('--no-modules', 'Skip static analysis module generation')
  .action(async (options) => {
    const { scanCommand } = await import('./commands/scan.js');
    await scanCommand(options);
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
