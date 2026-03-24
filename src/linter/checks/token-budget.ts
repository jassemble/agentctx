import type { AgentCtxConfig } from '../../core/config.js';
import type { ContextModule } from '../../core/context.js';
import { runGenerators } from '../../generators/index.js';
import type { LintResult } from '../index.js';

export async function checkTokenBudget(
  config: AgentCtxConfig,
  modules: ContextModule[],
): Promise<LintResult[]> {
  const results: LintResult[] = [];
  const generatorResults = await runGenerators(modules, config);

  for (const gen of generatorResults) {
    if (gen.tokenBudget === null) continue;

    const pct = Math.round((gen.tokenCount / gen.tokenBudget) * 100);
    const budgetFormatted = gen.tokenBudget.toLocaleString();
    const countFormatted = gen.tokenCount.toLocaleString();

    if (gen.tokenCount > gen.tokenBudget) {
      results.push({
        code: 'ACX003',
        name: 'token-budget',
        severity: 'warning',
        message: `${gen.path}: ${countFormatted}/${budgetFormatted} tokens (${pct}%) — exceeds budget`,
        passed: false,
      });
    } else {
      results.push({
        code: 'ACX003',
        name: 'token-budget',
        severity: 'info',
        message: `${gen.path}: ${countFormatted}/${budgetFormatted} tokens (${pct}%)`,
        passed: true,
      });
    }
  }

  return results;
}
