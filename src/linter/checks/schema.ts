import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { AgentCtxConfigSchema } from '../../core/config.js';
import type { LintResult } from '../index.js';

export async function checkSchema(basePath: string): Promise<LintResult[]> {
  const configPath = resolve(basePath, 'config.yaml');

  let rawContent: string;
  try {
    rawContent = await readFile(configPath, 'utf-8');
  } catch {
    return [
      {
        code: 'ACX006',
        name: 'schema-validation',
        severity: 'error',
        message: `Config file not found: ${configPath}`,
        passed: false,
      },
    ];
  }

  let raw: unknown;
  try {
    raw = parseYaml(rawContent);
  } catch (err) {
    return [
      {
        code: 'ACX006',
        name: 'schema-validation',
        severity: 'error',
        message: `Invalid YAML: ${err instanceof Error ? err.message : String(err)}`,
        passed: false,
      },
    ];
  }

  const result = AgentCtxConfigSchema.safeParse(raw);

  if (!result.success) {
    return result.error.issues.map((issue) => ({
      code: 'ACX006',
      name: 'schema-validation',
      severity: 'error' as const,
      message: `${issue.path.join('.')}: ${issue.message}`,
      passed: false,
    }));
  }

  return [
    {
      code: 'ACX006',
      name: 'schema-validation',
      severity: 'info',
      message: 'Config schema is valid',
      passed: true,
    },
  ];
}
