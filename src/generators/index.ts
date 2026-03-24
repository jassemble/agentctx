import type { ContextModule } from '../core/context.js';
import type { AgentCtxConfig } from '../core/config.js';
import { generateClaude } from './claude.js';
import { generateCursorrules } from './cursorrules.js';
import { estimateTokens } from '../utils/tokens.js';

export interface GeneratorResult {
  name: string;
  path: string;
  content: string;
  tokenCount: number;
  tokenBudget: number | null;
}

type GeneratorFn = (
  modules: ContextModule[],
  config: AgentCtxConfig,
) => string;

const generators: Record<string, GeneratorFn> = {
  claude: generateClaude,
  cursorrules: generateCursorrules,
};

export async function runGenerators(
  modules: ContextModule[],
  config: AgentCtxConfig,
): Promise<GeneratorResult[]> {
  const results: GeneratorResult[] = [];

  for (const [name, output] of Object.entries(config.outputs)) {
    if (!output.enabled) continue;

    const generator = generators[name];
    if (!generator) continue;

    const content = generator(modules, config);
    const tokenCount = estimateTokens(content);

    results.push({
      name,
      path: output.path,
      content,
      tokenCount,
      tokenBudget: output.max_tokens ?? null,
    });
  }

  return results;
}
