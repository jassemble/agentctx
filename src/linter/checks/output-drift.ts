import { dirname, resolve } from 'node:path';
import type { AgentCtxConfig } from '../../core/config.js';
import type { ContextModule } from '../../core/context.js';
import { runGenerators } from '../../generators/index.js';
import { fileExists, readFileContent } from '../../utils/fs.js';
import type { LintResult } from '../index.js';

export async function checkOutputDrift(
  config: AgentCtxConfig,
  modules: ContextModule[],
  basePath: string,
): Promise<LintResult[]> {
  const results: LintResult[] = [];
  const projectRoot = dirname(basePath);
  const generatorResults = await runGenerators(modules, config);

  for (const gen of generatorResults) {
    const outputPath = resolve(projectRoot, gen.path);
    const exists = await fileExists(outputPath);

    if (!exists) {
      results.push({
        code: 'ACX008',
        name: 'output-drift',
        severity: 'warning',
        message: `${gen.path}: output file not found, run agentctx generate`,
        passed: false,
      });
      continue;
    }

    const currentContent = await readFileContent(outputPath);

    if (currentContent !== gen.content) {
      results.push({
        code: 'ACX008',
        name: 'output-drift',
        severity: 'warning',
        message: `${gen.path}: output is out of date, run agentctx generate`,
        passed: false,
      });
    } else {
      results.push({
        code: 'ACX008',
        name: 'output-drift',
        severity: 'info',
        message: `${gen.path}: output is up to date`,
        passed: true,
      });
    }
  }

  return results;
}
