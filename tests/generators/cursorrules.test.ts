import { describe, it, expect } from 'vitest';
import { generateCursorrules } from '../../src/generators/cursorrules.js';
import type { AgentCtxConfig } from '../../src/core/config.js';

function makeConfig(overrides?: Partial<AgentCtxConfig>): AgentCtxConfig {
  return {
    version: 1 as const,
    project: { name: 'test-project', language: 'typescript', framework: 'nextjs' },
    skills: [],
    context: [],
    outputs: {
      cursorrules: { enabled: true, path: '.cursor/rules/agentctx.mdc', sections: { include: [], exclude: [] } },
    },
    references: [],
    lint: { token_budgets: true, broken_refs: true, freshness: { enabled: true, stale_days: 30 } },
    ...overrides,
  };
}

describe('generateCursorrules', () => {
  it('produces .mdc format with YAML frontmatter', () => {
    const result = generateCursorrules([], makeConfig());
    expect(result).toContain('---');
    expect(result).toContain('description:');
    expect(result).toContain('alwaysApply: true');
    expect(result).toContain('globs:');
  });

  it('includes project name', () => {
    const result = generateCursorrules([], makeConfig());
    expect(result).toContain('test-project');
  });

  it('includes routing to context directories', () => {
    const result = generateCursorrules([], makeConfig());
    expect(result).toContain('conventions/*.md');
    expect(result).toContain('modules/*.md');
    expect(result).toContain('architecture.md');
  });

  it('includes project metadata', () => {
    const result = generateCursorrules([], makeConfig());
    expect(result).toContain('typescript');
    expect(result).toContain('nextjs');
  });

  it('includes protocol instructions', () => {
    const result = generateCursorrules([], makeConfig());
    expect(result).toContain('Before writing code');
    expect(result).toContain('/spec');
  });

  it('shows agent name when configured', () => {
    const result = generateCursorrules([], makeConfig({ agent: 'frontend-developer' }));
    expect(result).toContain('frontend-developer');
  });

  it('is thin — under 500 tokens', () => {
    const result = generateCursorrules([], makeConfig());
    const words = result.split(/\s+/).length;
    expect(words).toBeLessThan(500);
  });
});
