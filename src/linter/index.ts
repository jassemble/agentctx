import type { AgentCtxConfig } from '../core/config.js';
import type { ContextModule } from '../core/context.js';
import { checkBrokenRefs } from './checks/broken-refs.js';
import { checkTokenBudget } from './checks/token-budget.js';
import { checkSchema } from './checks/schema.js';
import { checkOutputDrift } from './checks/output-drift.js';
import { checkAi } from './checks/ai.js';

export interface LintResult {
  code: string;
  name: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  passed: boolean;
}

export async function runLintChecks(
  config: AgentCtxConfig,
  modules: ContextModule[],
  basePath: string,
  options?: { ai?: boolean },
): Promise<LintResult[]> {
  const results: LintResult[] = [];

  const checks = [
    checkSchema(basePath),
    checkBrokenRefs(config, modules, basePath),
    checkTokenBudget(config, modules),
    checkOutputDrift(config, modules, basePath),
  ];

  if (options?.ai) {
    checks.push(checkAi(modules));
  }

  const allResults = await Promise.all(checks);
  for (const r of allResults) {
    results.push(...r);
  }

  return results;
}
