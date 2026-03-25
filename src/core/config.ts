import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const ReferenceSchema = z.union([
  z.object({
    path: z.string(),
    label: z.string().optional(),
    inline: z.boolean().default(false),
  }),
  z.object({
    url: z.string().url(),
    label: z.string().optional(),
  }),
]);

const OutputTargetSchema = z.object({
  enabled: z.boolean().default(true),
  path: z.string(),
  max_tokens: z.number().positive().optional(),
  sections: z
    .object({
      include: z.array(z.string()).default([]),
      exclude: z.array(z.string()).default([]),
    })
    .default({}),
});

const LintFreshnessSchema = z.object({
  enabled: z.boolean().default(true),
  stale_days: z.number().positive().default(30),
});

const LintSchema = z.object({
  token_budgets: z.boolean().default(true),
  broken_refs: z.boolean().default(true),
  freshness: LintFreshnessSchema.default({}),
});

const InheritSchema = z.object({
  from: z.string(),
  strategy: z.enum(['merge', 'override', 'append']).default('merge'),
  exclude: z.array(z.string()).default([]),
});

export const AgentCtxConfigSchema = z.object({
  version: z.literal(1),
  project: z.object({
    name: z.string(),
    language: z.string().optional(),
    framework: z.string().optional(),
  }),
  agent: z.string().optional(),
  skills: z.array(z.string()).default([]),
  context: z.array(z.string()).default([]),
  outputs: z.record(z.string(), OutputTargetSchema).default({}),
  references: z.array(ReferenceSchema).default([]),
  lint: LintSchema.default({}),
  inherit: InheritSchema.optional(),
});

export type AgentCtxConfig = z.infer<typeof AgentCtxConfigSchema>;

export function validateConfig(raw: unknown): AgentCtxConfig {
  return AgentCtxConfigSchema.parse(raw);
}

export async function loadConfig(configPath: string): Promise<AgentCtxConfig> {
  const absolutePath = resolve(configPath);
  const content = await readFile(absolutePath, 'utf-8');
  const raw = parseYaml(content);
  return validateConfig(raw);
}

export function findConfigPath(startDir?: string): string | null {
  let dir = resolve(startDir ?? process.cwd());
  const root = dirname(dir) === dir ? dir : undefined;

  while (true) {
    const candidate = join(dir, '.agentctx', 'config.yaml');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return null;
}
