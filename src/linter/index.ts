import type { AgentCtxConfig } from '../core/config.js';
import type { ContextModule } from '../core/context.js';
import { checkBrokenRefs } from './checks/broken-refs.js';
import { checkTokenBudget } from './checks/token-budget.js';
import { checkSchema } from './checks/schema.js';
import { checkOutputDrift } from './checks/output-drift.js';

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
): Promise<LintResult[]> {
  const results: LintResult[] = [];

  const [schemaResults, brokenRefResults, tokenBudgetResults, driftResults] =
    await Promise.all([
      checkSchema(basePath),
      checkBrokenRefs(config, modules, basePath),
      checkTokenBudget(config, modules),
      checkOutputDrift(config, modules, basePath),
    ]);

  results.push(...schemaResults);
  results.push(...brokenRefResults);
  results.push(...tokenBudgetResults);
  results.push(...driftResults);

  return results;
}
