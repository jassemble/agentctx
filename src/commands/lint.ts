import { dirname } from 'node:path';
import { findConfigPath, loadConfig } from '../core/config.js';
import { loadContextModules } from '../core/context.js';
import { logger } from '../utils/logger.js';
import { runLintChecks, type LintResult } from '../linter/index.js';

export async function lintCommand(options: {
  strict?: boolean;
  format?: string;
  ai?: boolean;
}): Promise<void> {
  const configPath = findConfigPath();
  if (!configPath) {
    logger.error('No .agentctx/config.yaml found. Run `agentctx init` first.');
    process.exit(1);
  }

  const config = await loadConfig(configPath);
  const agentctxDir = dirname(configPath);

  const modules = await loadContextModules(config, agentctxDir);
  if (options.ai) {
    logger.info('Running AI-powered analysis (using claude CLI)...\n');
  }
  const results = await runLintChecks(config, modules, agentctxDir, { ai: options.ai });

  if (options.format === 'json') {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const grouped = {
    error: results.filter((r) => r.severity === 'error' && !r.passed),
    warning: results.filter((r) => r.severity === 'warning' && !r.passed),
    info: results.filter((r) => r.severity === 'info' && !r.passed),
  };

  const passed = results.filter((r) => r.passed);
  let hasIssues = false;

  if (grouped.error.length > 0) {
    hasIssues = true;
    console.log('\nErrors:');
    for (const r of grouped.error) {
      logger.error(`[${r.code}] ${r.name}: ${r.message}`);
    }
  }

  if (grouped.warning.length > 0) {
    hasIssues = true;
    console.log('\nWarnings:');
    for (const r of grouped.warning) {
      logger.warn(`[${r.code}] ${r.name}: ${r.message}`);
    }
  }

  if (grouped.info.length > 0) {
    console.log('\nInfo:');
    for (const r of grouped.info) {
      logger.info(`[${r.code}] ${r.name}: ${r.message}`);
    }
  }

  if (passed.length > 0) {
    console.log('');
    for (const r of passed) {
      logger.success(`[${r.code}] ${r.name}`);
    }
  }

  if (options.format === 'github') {
    for (const r of results.filter((r) => !r.passed)) {
      const level = r.severity === 'error' ? 'error' : 'warning';
      console.log(`::${level}::${r.code}: ${r.name} — ${r.message}`);
    }
  }

  console.log(
    `\n${passed.length} passed, ${grouped.error.length} errors, ${grouped.warning.length} warnings\n`,
  );

  if (options.strict && hasIssues) {
    process.exit(1);
  } else if (grouped.error.length > 0) {
    process.exit(1);
  }
}
