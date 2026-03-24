import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { findConfigPath } from '../core/config.js';
import { resolveInheritance } from '../core/inheritance.js';
import { runGenerators } from '../generators/index.js';
import { estimateTokens } from '../utils/tokens.js';
import { logger } from '../utils/logger.js';

export async function statusCommand(): Promise<void> {
  const configPath = findConfigPath();
  if (!configPath) {
    logger.error('No .agentctx/config.yaml found. Run `agentctx init` first.');
    process.exit(1);
  }

  const resolved = await resolveInheritance(configPath);
  const { config, modules, projectRoot } = resolved;

  const results = await runGenerators(modules, config);

  // Project name
  console.log(`\nProject: ${config.project.name}\n`);

  // Context modules table
  console.log('Context Modules:');
  console.log(
    '  ' +
      'Filename'.padEnd(30) +
      'Title'.padEnd(30) +
      'Tokens'.padEnd(10) +
      'Last Modified',
  );
  console.log('  ' + '-'.repeat(90));
  for (const mod of modules) {
    const tokens = estimateTokens(mod.content);
    const modified = mod.lastModified.toLocaleDateString();
    console.log(
      '  ' +
        mod.filename.padEnd(30) +
        mod.title.padEnd(30) +
        String(tokens).padEnd(10) +
        modified,
    );
  }

  // Output targets table
  console.log('\nOutput Targets:');
  console.log(
    '  ' +
      'Name'.padEnd(20) +
      'Path'.padEnd(35) +
      'Tokens/Budget'.padEnd(20) +
      'In Sync?',
  );
  console.log('  ' + '-'.repeat(85));
  for (const result of results) {
    const budgetStr =
      result.tokenBudget !== null
        ? `${result.tokenCount}/${result.tokenBudget}`
        : `${result.tokenCount}`;

    // Check if in sync
    const outputPath = resolve(projectRoot, result.path);
    let inSync = false;
    try {
      const existing = await readFile(outputPath, 'utf-8');
      inSync = existing === result.content;
    } catch {
      // file doesn't exist
    }

    const syncLabel = inSync ? 'yes' : 'no';
    console.log(
      '  ' +
        result.name.padEnd(20) +
        result.path.padEnd(35) +
        budgetStr.padEnd(20) +
        syncLabel,
    );
  }

  console.log('');
}
