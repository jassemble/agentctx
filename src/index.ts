import { Command } from 'commander';

const program = new Command();

program
  .name('agentctx')
  .description('Unified agent context management — one source of truth, many AI agent outputs')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize .agentctx/ in current directory')
  .option('--import', 'Auto-import existing context files (non-interactive)')
  .option('--no-interactive', 'Skip interactive prompts, use defaults')
  .option('--force', 'Overwrite existing .agentctx/ directory')
  .action(async (options) => {
    const { initCommand } = await import('./commands/init.js');
    await initCommand(options);
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

program.parse();
