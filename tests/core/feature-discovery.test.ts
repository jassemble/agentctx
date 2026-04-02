import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { discoverFeatures } from '../../src/core/feature-discovery';
import type { CodebaseProfile } from '../../src/core/detector';

const MY_APP = resolve('/Users/jaspreetsingh/Desktop/Projects/OSS/my-app-01');

function makeProfile(overrides?: Partial<CodebaseProfile>): CodebaseProfile {
  return {
    language: 'typescript',
    framework: 'nextjs',
    testRunner: 'vitest',
    linter: null,
    orm: null,
    ci: null,
    packageManager: 'npm',
    isMonorepo: false,
    detectedFiles: [],
    ...overrides,
  };
}

describe('discoverFeatures', () => {
  it('discovers features mirroring source directory structure', async () => {
    const profile = makeProfile();
    const featureMap = await discoverFeatures(MY_APP, profile);

    expect(featureMap.features.length).toBeGreaterThan(0);

    const modulePaths = featureMap.features.map(f => f.modulePath);

    // Should mirror source dirs: components/theme, components/layout, etc.
    expect(modulePaths.some(p => p.startsWith('components/'))).toBe(true);
  });

  it('module paths mirror source directories', async () => {
    const profile = makeProfile();
    const featureMap = await discoverFeatures(MY_APP, profile);

    for (const feature of featureMap.features) {
      // modulePath should look like a directory path
      expect(feature.modulePath).toMatch(/^[a-z]/);
      expect(feature.modulePath).not.toContain('('); // route groups stripped
      expect(feature.files.length).toBeGreaterThan(0);
    }
  });

  it('collects root-level files separately', async () => {
    const profile = makeProfile();
    const featureMap = await discoverFeatures(MY_APP, profile);

    // app/layout.tsx, app/page.tsx should be in rootFiles
    const totalFeatureFiles = featureMap.features.reduce((sum, f) => sum + f.files.length, 0);
    const total = totalFeatureFiles + featureMap.rootFiles.length;
    expect(total).toBeGreaterThan(0);
  });

  it('strips Next.js route group parentheses from modulePath', async () => {
    const profile = makeProfile();
    const featureMap = await discoverFeatures(MY_APP, profile);

    // app/(auth)/login/ should become app/auth/login in modulePath
    const authModule = featureMap.features.find(f => f.modulePath.includes('auth'));
    if (authModule) {
      expect(authModule.modulePath).not.toContain('(');
      expect(authModule.modulePath).not.toContain(')');
    }
  });
});
