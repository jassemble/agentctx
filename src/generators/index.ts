import type { ContextModule } from '../core/context.js';
import type { AgentCtxConfig } from '../core/config.js';
import { generateClaude } from './claude.js';
import { generateCursorrules } from './cursorrules.js';
import {
  generateCopilot, generateAider, generateWindsurf, generateCodex, generateGemini,
  generateOpenclawSoul, generateOpenclawAgents, generateOpenclawIdentity,
  generateOpencode, generateQwen,
} from './providers.js';
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
  copilot: generateCopilot,
  aider: generateAider,
  windsurf: generateWindsurf,
  codex: generateCodex,
  gemini: generateGemini,
  opencode: generateOpencode,
  qwen: generateQwen,
};

// OpenClaw produces 3 files — handled specially
const openclawGenerators: Record<string, GeneratorFn> = {
  'openclaw-soul': generateOpenclawSoul,
  'openclaw-agents': generateOpenclawAgents,
  'openclaw-identity': generateOpenclawIdentity,
};

export async function runGenerators(
  modules: ContextModule[],
  config: AgentCtxConfig,
): Promise<GeneratorResult[]> {
  const results: GeneratorResult[] = [];

  for (const [name, output] of Object.entries(config.outputs)) {
    if (!output.enabled) continue;

    // OpenClaw produces 3 files from one output config
    if (name === 'openclaw') {
      for (const [subName, generator] of Object.entries(openclawGenerators)) {
        const content = generator(modules, config);
        const fileName = subName === 'openclaw-soul' ? 'SOUL.md'
          : subName === 'openclaw-agents' ? 'AGENTS.md'
          : 'IDENTITY.md';
        const path = output.path.replace(/\/?$/, `/${fileName}`);
        results.push({
          name: subName,
          path,
          content,
          tokenCount: estimateTokens(content),
          tokenBudget: null,
        });
      }
      continue;
    }

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
