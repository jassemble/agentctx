import { resolve, dirname } from 'node:path';
import type { AgentCtxConfig } from '../../core/config.js';
import type { ContextModule } from '../../core/context.js';
import { fileExists } from '../../utils/fs.js';
import type { LintResult } from '../index.js';

export async function checkBrokenRefs(
  config: AgentCtxConfig,
  modules: ContextModule[],
  basePath: string,
): Promise<LintResult[]> {
  const results: LintResult[] = [];
  const projectRoot = dirname(basePath);

  // Check context file refs
  for (const relPath of config.context) {
    const fullPath = resolve(basePath, relPath);
    const exists = await fileExists(fullPath);
    if (!exists) {
      results.push({
        code: 'ACX001',
        name: 'broken-file-ref',
        severity: 'error',
        message: `Context file not found: ${relPath}`,
        passed: false,
      });
    }
  }

  // Check references with path property
  for (const ref of config.references) {
    if ('path' in ref) {
      const fullPath = resolve(projectRoot, ref.path);
      const exists = await fileExists(fullPath);
      if (!exists) {
        results.push({
          code: 'ACX001',
          name: 'broken-file-ref',
          severity: 'error',
          message: `Reference not found: ${ref.path}`,
          passed: false,
        });
      }
    }
  }

  if (results.length === 0) {
    results.push({
      code: 'ACX001',
      name: 'broken-file-ref',
      severity: 'info',
      message: 'All file references resolve correctly',
      passed: true,
    });
  }

  return results;
}
