import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolveInheritance } from '../../src/core/inheritance.js';
import { join } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const FIXTURES = join(__dirname, '..', 'fixtures', 'monorepo');
const ROOT_CONFIG = join(FIXTURES, '.agentctx', 'config.yaml');
const BACKEND_CONFIG = join(FIXTURES, 'apps', 'backend', '.agentctx', 'config.yaml');

// Temporary fixtures for override/append/replacement tests
const TEMP = join(__dirname, '..', 'fixtures', '_temp_inheritance');

beforeAll(async () => {
  // Create temp fixtures for additional test scenarios
  await mkdir(join(TEMP, '.agentctx', 'context'), { recursive: true });
  await mkdir(join(TEMP, 'apps', 'override-app', '.agentctx', 'context'), { recursive: true });
  await mkdir(join(TEMP, 'apps', 'append-app', '.agentctx', 'context'), { recursive: true });
  await mkdir(join(TEMP, 'apps', 'replace-app', '.agentctx', 'context'), { recursive: true });
  await mkdir(join(TEMP, 'apps', 'missing-parent', '.agentctx', 'context'), { recursive: true });

  // Root
  await writeFile(
    join(TEMP, '.agentctx', 'config.yaml'),
    `version: 1
project:
  name: temp-root
  language: typescript
context:
  - context/shared.md
outputs:
  claude:
    enabled: true
    path: CLAUDE.md
`,
  );
  await writeFile(
    join(TEMP, '.agentctx', 'context', 'shared.md'),
    '# Shared\n\nShared context.\n',
  );

  // Override app
  await writeFile(
    join(TEMP, 'apps', 'override-app', '.agentctx', 'config.yaml'),
    `version: 1
project:
  name: override-app
  language: typescript
context:
  - context/local.md
outputs:
  claude:
    enabled: true
    path: CLAUDE.md
inherit:
  from: ../../.agentctx
  strategy: override
`,
  );
  await writeFile(
    join(TEMP, 'apps', 'override-app', '.agentctx', 'context', 'local.md'),
    '# Local\n\nLocal only.\n',
  );

  // Append app
  await writeFile(
    join(TEMP, 'apps', 'append-app', '.agentctx', 'config.yaml'),
    `version: 1
project:
  name: append-app
  language: typescript
context:
  - context/extra.md
outputs:
  claude:
    enabled: true
    path: CLAUDE.md
inherit:
  from: ../../.agentctx
  strategy: append
`,
  );
  await writeFile(
    join(TEMP, 'apps', 'append-app', '.agentctx', 'context', 'extra.md'),
    '# Extra\n\nExtra context.\n',
  );

  // Replace app (merge strategy, same filename as parent)
  await writeFile(
    join(TEMP, 'apps', 'replace-app', '.agentctx', 'config.yaml'),
    `version: 1
project:
  name: replace-app
  language: typescript
context:
  - context/shared.md
outputs:
  claude:
    enabled: true
    path: CLAUDE.md
inherit:
  from: ../../.agentctx
  strategy: merge
`,
  );
  await writeFile(
    join(TEMP, 'apps', 'replace-app', '.agentctx', 'context', 'shared.md'),
    '# Shared Override\n\nChild replaces parent.\n',
  );

  // Missing parent app
  await writeFile(
    join(TEMP, 'apps', 'missing-parent', '.agentctx', 'config.yaml'),
    `version: 1
project:
  name: missing-parent
  language: typescript
context:
  - context/stuff.md
outputs:
  claude:
    enabled: true
    path: CLAUDE.md
inherit:
  from: ../../nonexistent/.agentctx
  strategy: merge
`,
  );
  await writeFile(
    join(TEMP, 'apps', 'missing-parent', '.agentctx', 'context', 'stuff.md'),
    '# Stuff\n\nSome stuff.\n',
  );
});

afterAll(async () => {
  if (existsSync(TEMP)) {
    await rm(TEMP, { recursive: true, force: true });
  }
});

describe('resolveInheritance', () => {
  it('resolves root config without inheritance (returns itself)', async () => {
    const result = await resolveInheritance(ROOT_CONFIG);

    expect(result.config.project.name).toBe('monorepo-root');
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].filename).toBe('shared.md');
    expect(result.modules[0].content).toContain('Shared principles');
    expect(result.configPath).toBe(ROOT_CONFIG);
    expect(result.projectRoot).toBe(FIXTURES);
  });

  it('child config with merge strategy returns parent + child modules', async () => {
    const result = await resolveInheritance(BACKEND_CONFIG);

    expect(result.config.project.name).toBe('backend-app');
    expect(result.modules).toHaveLength(2);

    const filenames = result.modules.map((m) => m.filename);
    expect(filenames).toContain('shared.md');
    expect(filenames).toContain('api.md');

    // Parent modules come first
    expect(result.modules[0].filename).toBe('shared.md');
    expect(result.modules[1].filename).toBe('api.md');
  });

  it('child module with same filename as parent replaces parent (merge)', async () => {
    const configPath = join(
      TEMP,
      'apps',
      'replace-app',
      '.agentctx',
      'config.yaml',
    );
    const result = await resolveInheritance(configPath);

    // Only one module named shared.md — the child version
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].filename).toBe('shared.md');
    expect(result.modules[0].content).toContain('Child replaces parent');
  });

  it('override strategy returns only child modules', async () => {
    const configPath = join(
      TEMP,
      'apps',
      'override-app',
      '.agentctx',
      'config.yaml',
    );
    const result = await resolveInheritance(configPath);

    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].filename).toBe('local.md');
    expect(result.modules[0].content).toContain('Local only');
  });

  it('append strategy returns parent + child (no replacement)', async () => {
    const configPath = join(
      TEMP,
      'apps',
      'append-app',
      '.agentctx',
      'config.yaml',
    );
    const result = await resolveInheritance(configPath);

    expect(result.modules).toHaveLength(2);
    expect(result.modules[0].filename).toBe('shared.md');
    expect(result.modules[0].content).toContain('Shared context');
    expect(result.modules[1].filename).toBe('extra.md');
    expect(result.modules[1].content).toContain('Extra context');
  });

  it('missing parent config throws error', async () => {
    const configPath = join(
      TEMP,
      'apps',
      'missing-parent',
      '.agentctx',
      'config.yaml',
    );

    await expect(resolveInheritance(configPath)).rejects.toThrow(
      'Parent config not found',
    );
  });
});
