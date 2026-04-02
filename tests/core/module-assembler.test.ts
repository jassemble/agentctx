import { describe, it, expect } from 'vitest';
import { assembleModule, computeSourceHash } from '../../src/core/module-assembler';
import type { FeatureBoundary } from '../../src/core/feature-discovery';
import type { FileAnalysis } from '../../src/core/ast-analyzer';

function makeFeature(overrides?: Partial<FeatureBoundary>): FeatureBoundary {
  return {
    name: 'auth',
    modulePath: 'src/auth',
    directory: 'src/auth',
    files: ['src/auth/index.ts', 'src/auth/types.ts'],
    ...overrides,
  };
}

function makeAnalysis(overrides?: Partial<FileAnalysis>): FileAnalysis {
  return {
    filePath: 'src/auth/index.ts',
    exports: [
      { name: 'signIn', kind: 'function' },
      { name: 'signOut', kind: 'function' },
    ],
    imports: [
      { from: './types', symbols: ['User'], isTypeOnly: false },
    ],
    types: [],
    functions: [
      {
        name: 'signIn',
        params: '(email: string, password: string)',
        returnType: 'Promise<User | null>',
        isAsync: true,
        exported: true,
      },
      {
        name: 'signOut',
        params: '(sessionId: string)',
        returnType: 'Promise<void>',
        isAsync: true,
        exported: true,
      },
    ],
    components: [],
    hooks: [],
    ...overrides,
  };
}

function makeTypeAnalysis(): FileAnalysis {
  return {
    filePath: 'src/auth/types.ts',
    exports: [
      { name: 'User', kind: 'interface' },
      { name: 'Role', kind: 'type' },
    ],
    imports: [],
    types: [
      {
        name: 'User',
        kind: 'interface',
        signature: 'interface User { id: string; email: string; role: Role }',
        exported: true,
      },
      {
        name: 'Role',
        kind: 'type',
        signature: "type Role = 'admin' | 'editor' | 'viewer'",
        exported: true,
      },
    ],
    functions: [],
    components: [],
    hooks: [],
  };
}

describe('assembleModule', () => {
  it('generates valid markdown with frontmatter', () => {
    const feature = makeFeature();
    const analyses = [makeAnalysis(), makeTypeAnalysis()];

    const markdown = assembleModule(feature, analyses, [feature], analyses, process.cwd());

    expect(markdown).toContain('---');
    expect(markdown).toContain('generated-by: agentctx-scan');
    expect(markdown).toContain('source-hash:');
    expect(markdown).toContain('# Auth');
  });

  it('includes Key Files section', () => {
    const feature = makeFeature();
    const analyses = [makeAnalysis()];

    const markdown = assembleModule(feature, analyses, [feature], analyses, process.cwd());

    expect(markdown).toContain('## Key Files');
    expect(markdown).toContain('`src/auth/index.ts`');
  });

  it('includes Types section for exported types', () => {
    const feature = makeFeature();
    const analyses = [makeAnalysis(), makeTypeAnalysis()];

    const markdown = assembleModule(feature, analyses, [feature], analyses, process.cwd());

    expect(markdown).toContain('## Types');
    expect(markdown).toContain('interface User');
    expect(markdown).toContain('Role');
  });

  it('includes Functions section', () => {
    const feature = makeFeature();
    const analyses = [makeAnalysis()];

    const markdown = assembleModule(feature, analyses, [feature], analyses, process.cwd());

    expect(markdown).toContain('## Functions');
    expect(markdown).toContain('signIn');
    expect(markdown).toContain('Promise<User | null>');
  });

  it('includes Exports section', () => {
    const feature = makeFeature();
    const analyses = [makeAnalysis(), makeTypeAnalysis()];

    const markdown = assembleModule(feature, analyses, [feature], analyses, process.cwd());

    expect(markdown).toContain('## Exports');
    expect(markdown).toContain('`signIn`');
    expect(markdown).toContain('`User`');
  });

  it('includes Components section when present', () => {
    const feature = makeFeature({ name: 'ui', modulePath: 'src/ui', files: ['src/ui/button.tsx'] });
    const analyses: FileAnalysis[] = [{
      filePath: 'src/ui/button.tsx',
      exports: [{ name: 'Button', kind: 'component' }],
      imports: [],
      types: [],
      functions: [],
      components: [{
        name: 'Button',
        props: '{ variant: string; children: ReactNode }',
        hooks: ['useState'],
      }],
      hooks: [{ name: 'useState', source: 'react' }],
    }];

    const markdown = assembleModule(feature, analyses, [feature], analyses, process.cwd());

    expect(markdown).toContain('## Components');
    expect(markdown).toContain('<Button');
    expect(markdown).toContain('hooks: useState');
  });
});

describe('computeSourceHash', () => {
  it('returns an 8-char hex hash', () => {
    const hash = computeSourceHash(process.cwd(), ['package.json']);
    expect(hash).toMatch(/^[a-f0-9]{8}$/);
  });

  it('returns same hash for same files', () => {
    const hash1 = computeSourceHash(process.cwd(), ['package.json']);
    const hash2 = computeSourceHash(process.cwd(), ['package.json']);
    expect(hash1).toBe(hash2);
  });

  it('handles missing files gracefully', () => {
    const hash = computeSourceHash(process.cwd(), ['nonexistent.ts']);
    expect(hash).toMatch(/^[a-f0-9]{8}$/);
  });
});
