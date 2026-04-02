import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve, join } from 'node:path';
import { checkBrokenRefs } from '../../src/linter/checks/broken-refs.js';
import { checkTokenBudget } from '../../src/linter/checks/token-budget.js';
import { checkSchema } from '../../src/linter/checks/schema.js';
import { checkOutputDrift } from '../../src/linter/checks/output-drift.js';
import type { AgentCtxConfig } from '../../src/core/config.js';
import type { ContextModule } from '../../src/core/context.js';

const FIXTURES = resolve(__dirname, '../fixtures');
const SIMPLE_PROJECT = join(FIXTURES, 'simple-project');
const BASE_PATH = join(SIMPLE_PROJECT, '.agentctx');

function makeConfig(overrides?: Partial<AgentCtxConfig>): AgentCtxConfig {
  return {
    version: 1 as const,
    project: { name: 'simple-project', language: 'typescript', framework: 'nextjs' },
    skills: [],
    context: ['context/principles.md', 'context/testing.md'],
    outputs: {
      claude: {
        enabled: true,
        path: 'CLAUDE.md',
        max_tokens: 8000,
        sections: { include: [], exclude: ['workflows'] },
      },
      cursorrules: {
        enabled: true,
        path: '.cursorrules',
        max_tokens: 4000,
        sections: { include: [], exclude: [] },
      },
    },
    references: [
      { path: 'docs/API.md', label: 'API Documentation', inline: false },
    ],
    lint: {
      token_budgets: true,
      broken_refs: true,
      freshness: { enabled: true, stale_days: 30 },
    },
    ...overrides,
  };
}

function makeModules(): ContextModule[] {
  return [
    {
      title: 'Principles',
      filename: 'principles.md',
      relativePath: 'context/principles.md',
      content: '# Principles\n\n## Code Quality\n- Write clean, readable code\n- Follow SOLID principles\n- Prefer composition over inheritance\n\n## Testing\n- All public APIs must have tests\n- Aim for >80% coverage\n',
      lastModified: new Date('2025-01-01'),
    },
    {
      title: 'Testing',
      filename: 'testing.md',
      relativePath: 'context/testing.md',
      content: '# Testing\n\n## Strategy\n- Unit tests for business logic\n- Integration tests for API endpoints\n- E2E tests for critical user flows\n\n## Tools\n- Vitest for unit/integration tests\n- Playwright for E2E tests\n',
      lastModified: new Date('2025-01-02'),
    },
  ];
}

describe('checkBrokenRefs (ACX001)', () => {
  it('passes when all context files exist', async () => {
    const config = makeConfig();
    const results = await checkBrokenRefs(config, makeModules(), BASE_PATH);
    // The context files exist, but the reference docs/API.md does not exist in the fixture
    // So we expect at least one failure for the reference
    const contextResults = results.filter(
      (r) => !r.message.includes('docs/API.md'),
    );
    // If all context files exist and refs have failures, the overall results won't have
    // the pass-all message. Let's test with no references to isolate context checking.
    const configNoRefs = makeConfig({ references: [] });
    const cleanResults = await checkBrokenRefs(configNoRefs, makeModules(), BASE_PATH);
    expect(cleanResults).toHaveLength(1);
    expect(cleanResults[0].passed).toBe(true);
    expect(cleanResults[0].code).toBe('ACX001');
    expect(cleanResults[0].message).toContain('All file references resolve correctly');
  });

  it('fails when a context file is missing', async () => {
    const config = makeConfig({
      context: ['context/principles.md', 'context/nonexistent.md'],
      references: [],
    });
    const results = await checkBrokenRefs(config, makeModules(), BASE_PATH);
    expect(results.some((r) => !r.passed)).toBe(true);
    const fail = results.find((r) => !r.passed)!;
    expect(fail.code).toBe('ACX001');
    expect(fail.severity).toBe('error');
    expect(fail.message).toContain('nonexistent.md');
  });

  it('fails when a reference path is missing', async () => {
    const config = makeConfig({
      context: ['context/principles.md', 'context/testing.md'],
      references: [{ path: 'does/not/exist.md', label: 'Missing', inline: false }],
    });
    const results = await checkBrokenRefs(config, makeModules(), BASE_PATH);
    expect(results.some((r) => !r.passed)).toBe(true);
    const fail = results.find((r) => !r.passed)!;
    expect(fail.message).toContain('does/not/exist.md');
  });

  it('ignores URL references', async () => {
    const config = makeConfig({
      references: [{ url: 'https://example.com', label: 'Docs' }],
    });
    const results = await checkBrokenRefs(config, makeModules(), BASE_PATH);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });
});

describe('checkTokenBudget (ACX003)', () => {
  it('passes when content is within budget', async () => {
    const config = makeConfig();
    const results = await checkTokenBudget(config, makeModules());
    // The fixture content is small, well within 8000/4000 token budgets
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.code).toBe('ACX003');
      expect(r.passed).toBe(true);
      expect(r.message).toMatch(/\d+\/[\d,]+ tokens \(\d+%\)/);
    }
  });

  it('warns when content exceeds budget', async () => {
    const config = makeConfig({
      outputs: {
        claude: {
          enabled: true,
          path: 'CLAUDE.md',
          max_tokens: 1, // impossibly low budget
          sections: { include: [], exclude: [] },
        },
      },
    });
    const results = await checkTokenBudget(config, makeModules());
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe('warning');
    expect(results[0].message).toContain('exceeds budget');
  });

  it('skips outputs without max_tokens', async () => {
    const config = makeConfig({
      outputs: {
        claude: {
          enabled: true,
          path: 'CLAUDE.md',
          sections: { include: [], exclude: [] },
        },
      },
    });
    const results = await checkTokenBudget(config, makeModules());
    // No max_tokens means it's skipped
    expect(results).toHaveLength(0);
  });
});

describe('checkSchema (ACX006)', () => {
  it('passes for a valid config', async () => {
    const results = await checkSchema(BASE_PATH);
    expect(results).toHaveLength(1);
    expect(results[0].code).toBe('ACX006');
    expect(results[0].passed).toBe(true);
    expect(results[0].message).toContain('valid');
  });

  it('fails for a missing config file', async () => {
    const results = await checkSchema('/nonexistent/path');
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe('error');
    expect(results[0].message).toContain('not found');
  });

  it('fails for an invalid config', async () => {
    // Create a temporary directory with an invalid config
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const tmpDir = await mkdtemp(join(tmpdir(), 'agentctx-test-'));
    try {
      await writeFile(
        join(tmpDir, 'config.yaml'),
        'version: 99\nproject:\n  name: test\n',
      );
      const results = await checkSchema(tmpDir);
      expect(results.some((r) => !r.passed)).toBe(true);
      expect(results[0].severity).toBe('error');
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });
});

describe('checkOutputDrift (ACX008)', () => {
  it('warns when output file does not exist', async () => {
    const config = makeConfig();
    const results = await checkOutputDrift(config, makeModules(), BASE_PATH);
    // CLAUDE.md and .cursorrules don't exist in the fixture project root
    expect(results.length).toBeGreaterThan(0);
    const missing = results.filter((r) => r.message.includes('not found'));
    expect(missing.length).toBeGreaterThan(0);
    expect(missing[0].severity).toBe('warning');
    expect(missing[0].message).toContain('run agentctx generate');
  });

  it('warns when output content has drifted', async () => {
    const { mkdtemp, writeFile, mkdir, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const tmpDir = await mkdtemp(join(tmpdir(), 'agentctx-drift-'));
    const tmpBasePath = join(tmpDir, '.agentctx');
    await mkdir(tmpBasePath, { recursive: true });

    try {
      // Write a stale output file
      await writeFile(join(tmpDir, 'CLAUDE.md'), 'stale content');

      const config = makeConfig({
        outputs: {
          claude: {
            enabled: true,
            path: 'CLAUDE.md',
            max_tokens: 8000,
            sections: { include: [], exclude: [] },
          },
        },
      });

      const results = await checkOutputDrift(config, makeModules(), tmpBasePath);
      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(false);
      expect(results[0].severity).toBe('warning');
      expect(results[0].message).toContain('out of date');
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it('passes when output matches generated content', async () => {
    const { mkdtemp, writeFile, mkdir, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { runGenerators } = await import('../../src/generators/index.js');

    const tmpDir = await mkdtemp(join(tmpdir(), 'agentctx-match-'));
    const tmpBasePath = join(tmpDir, '.agentctx');
    await mkdir(tmpBasePath, { recursive: true });

    const config = makeConfig({
      outputs: {
        claude: {
          enabled: true,
          path: 'CLAUDE.md',
          max_tokens: 8000,
          sections: { include: [], exclude: [] },
        },
      },
    });

    try {
      // Generate expected content and write it to disk
      const genResults = await runGenerators(makeModules(), config);
      for (const gen of genResults) {
        await writeFile(join(tmpDir, gen.path), gen.content);
      }

      const results = await checkOutputDrift(config, makeModules(), tmpBasePath);
      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(true);
      expect(results[0].message).toContain('up to date');
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });
});
