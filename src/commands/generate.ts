import { dirname, resolve } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createTwoFilesPatch } from 'diff';
import { findConfigPath } from '../core/config.js';
import { resolveInheritance } from '../core/inheritance.js';
import { runGenerators } from '../generators/index.js';
import { setHookEntries, getHookScripts } from '../generators/hooks.js';
import { resolveSkills, composeSkills } from '../core/skills.js';
import { logger } from '../utils/logger.js';

export async function generateCommand(options: {
  target?: string;
  dryRun?: boolean;
  diff?: boolean;
  strict?: boolean;
  verbose?: boolean;
}): Promise<void> {
  const configPath = findConfigPath();
  if (!configPath) {
    logger.error('No .agentctx/config.yaml found. Run `agentctx init` first.');
    process.exit(1);
  }

  const resolved = await resolveInheritance(configPath);
  const { config, modules, missing, projectRoot } = resolved;
  const agentctxDir = resolved.agentctxDir;

  if (missing.length > 0) {
    for (const path of missing) {
      logger.warn(`Context file not found, skipping: ${path}`);
    }
    logger.warn('Remove missing entries from config.yaml or create the files.');
  }

  if (options.verbose) {
    logger.dim(`Config: ${configPath}`);
    logger.dim(`Project root: ${projectRoot}`);
  }

  if (options.verbose) {
    logger.dim(`Loaded ${modules.length} context module(s)`);
  }

  // Resolve skill hooks for the hooks generator
  if (config.skills && config.skills.length > 0 && config.outputs.hooks?.enabled) {
    try {
      const resolved = await resolveSkills(config.skills);
      const composed = await composeSkills(resolved);
      setHookEntries(composed.hooks);
    } catch {
      // Skills may not resolve in all contexts — hooks output will be empty
    }
  }

  let results = await runGenerators(modules, config);

  if (options.target) {
    results = results.filter((r) => r.name === options.target);
    if (results.length === 0) {
      logger.error(`No output target named "${options.target}"`);
      process.exit(1);
    }
  }

  let budgetExceeded = false;

  for (const result of results) {
    const outputPath = resolve(projectRoot, result.path);

    if (options.dryRun) {
      console.log(result.content);
      continue;
    }

    if (options.diff) {
      let existing = '';
      try {
        existing = await readFile(outputPath, 'utf-8');
      } catch {
        // file doesn't exist yet
      }
      const patch = createTwoFilesPatch(
        result.path,
        result.path,
        existing,
        result.content,
        'current',
        'generated',
      );
      console.log(patch);
      continue;
    }

    // Write file to disk
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(outputPath, result.content, 'utf-8');
    logger.success(`Wrote ${result.path}`);

    // For hooks target, also write hook script files
    if (result.name === 'hooks') {
      const hookScripts = getHookScripts();
      for (const script of hookScripts) {
        const scriptPath = resolve(projectRoot, '.agentctx', script.path);
        const scriptDir = dirname(scriptPath);
        if (!existsSync(scriptDir)) {
          await mkdir(scriptDir, { recursive: true });
        }
        await writeFile(scriptPath, script.content, 'utf-8');
      }
      if (hookScripts.length > 0) {
        logger.success(`Wrote ${hookScripts.length} hook scripts to .agentctx/hooks/`);
      }
    }
  }

  // Print summary
  if (!options.dryRun) {
    console.log('');
    logger.info('Summary:');
    for (const result of results) {
      const budgetStr =
        result.tokenBudget !== null
          ? ` (${Math.round((result.tokenCount / result.tokenBudget) * 100)}% of ${result.tokenBudget} budget)`
          : '';
      const overBudget =
        result.tokenBudget !== null && result.tokenCount > result.tokenBudget;

      if (overBudget) {
        budgetExceeded = true;
        logger.warn(
          `${result.name}: ${result.tokenCount} tokens${budgetStr} — over budget!`,
        );
      } else {
        logger.dim(`  ${result.name}: ${result.tokenCount} tokens${budgetStr}`);
      }
    }
  }

  if (options.strict && budgetExceeded) {
    logger.error('Token budget exceeded (strict mode)');
    process.exit(1);
  }
}
