import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { loadConfig, validateConfig, findConfigPath } from '../../src/core/config';

const FIXTURES = resolve(__dirname, '../fixtures');
const SIMPLE_PROJECT = join(FIXTURES, 'simple-project');
const CONFIG_PATH = join(SIMPLE_PROJECT, '.agentctx/config.yaml');

describe('loadConfig', () => {
  it('loads and validates a valid config file', async () => {
    const config = await loadConfig(CONFIG_PATH);
    expect(config.version).toBe(1);
    expect(config.project.name).toBe('simple-project');
    expect(config.project.language).toBe('typescript');
    expect(config.context).toEqual(['context/principles.md', 'context/testing.md']);
    expect(config.outputs.claude.enabled).toBe(true);
    expect(config.outputs.claude.max_tokens).toBe(8000);
    expect(config.outputs.claude.sections.exclude).toEqual(['workflows']);
  });

  it('throws on non-existent file', async () => {
    await expect(loadConfig('/no/such/file.yaml')).rejects.toThrow();
  });
});

describe('validateConfig', () => {
  it('accepts a minimal valid config', () => {
    const config = validateConfig({
      version: 1,
      project: { name: 'test' },
    });
    expect(config.project.name).toBe('test');
    expect(config.context).toEqual([]);
    expect(config.outputs).toEqual({});
    expect(config.references).toEqual([]);
    expect(config.lint.token_budgets).toBe(true);
  });

  it('rejects config with wrong version', () => {
    expect(() =>
      validateConfig({ version: 2, project: { name: 'test' } }),
    ).toThrow();
  });

  it('rejects config without project name', () => {
    expect(() => validateConfig({ version: 1, project: {} })).toThrow();
  });

  it('rejects config without project', () => {
    expect(() => validateConfig({ version: 1 })).toThrow();
  });

  it('applies defaults for optional fields', () => {
    const config = validateConfig({
      version: 1,
      project: { name: 'defaults-test' },
    });
    expect(config.lint.broken_refs).toBe(true);
    expect(config.lint.freshness.enabled).toBe(true);
    expect(config.lint.freshness.stale_days).toBe(30);
    expect(config.inherit).toBeUndefined();
  });

  it('validates references with url', () => {
    const config = validateConfig({
      version: 1,
      project: { name: 'ref-test' },
      references: [{ url: 'https://example.com', label: 'Docs' }],
    });
    expect(config.references).toHaveLength(1);
  });

  it('validates output sections defaults', () => {
    const config = validateConfig({
      version: 1,
      project: { name: 'output-test' },
      outputs: {
        claude: { path: 'CLAUDE.md' },
      },
    });
    expect(config.outputs.claude.enabled).toBe(true);
    expect(config.outputs.claude.sections.include).toEqual([]);
    expect(config.outputs.claude.sections.exclude).toEqual([]);
  });
});

describe('findConfigPath', () => {
  it('finds config in the given directory', () => {
    const result = findConfigPath(SIMPLE_PROJECT);
    expect(result).toBe(join(SIMPLE_PROJECT, '.agentctx', 'config.yaml'));
  });

  it('finds config from a subdirectory', () => {
    const subDir = join(SIMPLE_PROJECT, '.agentctx', 'context');
    const result = findConfigPath(subDir);
    expect(result).toBe(join(SIMPLE_PROJECT, '.agentctx', 'config.yaml'));
  });

  it('returns null when no config exists', () => {
    const result = findConfigPath('/tmp');
    expect(result).toBeNull();
  });
});
