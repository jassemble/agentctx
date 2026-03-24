import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

// ── Types ──────────────────────────────────────────────────────────────

export interface CodebaseProfile {
  language: string | null;
  framework: string | null;
  testRunner: string | null;
  linter: string | null;
  orm: string | null;
  ci: string | null;
  packageManager: string | null;
  isMonorepo: boolean;
  detectedFiles: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────

function readJsonSafe(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

export function hasDep(pkg: Record<string, unknown>, name: string): boolean {
  const deps = (pkg.dependencies ?? {}) as Record<string, string>;
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
  return name in deps || name in devDeps;
}

// ── Heuristic detection ────────────────────────────────────────────────

export function analyzeCodebase(projectRoot: string): CodebaseProfile {
  const profile: CodebaseProfile = {
    language: null,
    framework: null,
    testRunner: null,
    linter: null,
    orm: null,
    ci: null,
    packageManager: null,
    isMonorepo: false,
    detectedFiles: [],
  };

  const check = (rel: string): boolean => {
    const full = join(projectRoot, rel);
    if (existsSync(full)) {
      profile.detectedFiles.push(rel);
      return true;
    }
    return false;
  };

  // ── Language ──
  const pkgPath = join(projectRoot, 'package.json');
  const pkg = existsSync(pkgPath) ? readJsonSafe(pkgPath) : null;

  if (pkg) {
    profile.detectedFiles.push('package.json');
    profile.language = hasDep(pkg, 'typescript') ? 'typescript' : 'javascript';

    // Framework
    if (hasDep(pkg, 'next')) profile.framework = 'nextjs';
    else if (hasDep(pkg, 'react')) profile.framework = 'react';
    else if (hasDep(pkg, 'vue')) profile.framework = 'vue';
    else if (hasDep(pkg, 'svelte') || hasDep(pkg, '@sveltejs/kit')) profile.framework = 'svelte';
    else if (hasDep(pkg, 'express')) profile.framework = 'express';
    else if (hasDep(pkg, 'hono')) profile.framework = 'hono';
    else if (hasDep(pkg, '@nestjs/core')) profile.framework = 'nestjs';

    // Test runner
    if (hasDep(pkg, 'vitest')) profile.testRunner = 'vitest';
    else if (hasDep(pkg, 'jest')) profile.testRunner = 'jest';
    else if (hasDep(pkg, 'mocha')) profile.testRunner = 'mocha';

    // Linter
    const linters: string[] = [];
    if (hasDep(pkg, 'eslint')) linters.push('ESLint');
    if (hasDep(pkg, '@biomejs/biome')) linters.push('Biome');
    if (hasDep(pkg, 'prettier')) linters.push('Prettier');
    if (linters.length > 0) profile.linter = linters.join(' + ');

    // ORM
    if (hasDep(pkg, 'prisma') || hasDep(pkg, '@prisma/client')) profile.orm = 'Prisma';
    else if (hasDep(pkg, 'drizzle-orm')) profile.orm = 'Drizzle';
    else if (hasDep(pkg, 'typeorm')) profile.orm = 'TypeORM';

    // Monorepo
    const workspaces = (pkg as Record<string, unknown>).workspaces;
    if (workspaces) profile.isMonorepo = true;
  }

  if (!profile.language && check('pyproject.toml')) {
    profile.language = 'python';
    try {
      const content = readFileSync(join(projectRoot, 'pyproject.toml'), 'utf-8');
      if (content.includes('fastapi')) profile.framework = 'fastapi';
      else if (content.includes('django')) profile.framework = 'django';
      else if (content.includes('flask')) profile.framework = 'flask';

      if (content.includes('pytest')) profile.testRunner = 'pytest';
      if (content.includes('ruff')) profile.linter = 'Ruff';
      if (content.includes('sqlalchemy')) profile.orm = 'SQLAlchemy';
      else if (content.includes('sqlmodel')) profile.orm = 'SQLModel';
    } catch { /* ignore */ }
  }

  if (!profile.language && check('go.mod')) profile.language = 'go';
  if (!profile.language && check('Cargo.toml')) profile.language = 'rust';

  // Test runner from config files (if not yet detected)
  if (!profile.testRunner) {
    if (check('vitest.config.ts') || check('vitest.config.js')) profile.testRunner = 'vitest';
    else if (check('jest.config.js') || check('jest.config.ts')) profile.testRunner = 'jest';
    else if (check('pytest.ini') || check('conftest.py')) profile.testRunner = 'pytest';
  }

  // Linter from config files (if not yet detected)
  if (!profile.linter) {
    if (check('.eslintrc.js') || check('.eslintrc.json') || check('eslint.config.js') || check('eslint.config.mjs')) {
      profile.linter = 'ESLint';
    } else if (check('biome.json') || check('biome.jsonc')) {
      profile.linter = 'Biome';
    }
  }

  // CI
  if (existsSync(join(projectRoot, '.github', 'workflows'))) {
    profile.ci = 'GitHub Actions';
    profile.detectedFiles.push('.github/workflows/');
  } else if (check('.gitlab-ci.yml')) {
    profile.ci = 'GitLab CI';
  } else if (existsSync(join(projectRoot, '.circleci'))) {
    profile.ci = 'CircleCI';
    profile.detectedFiles.push('.circleci/');
  }

  // Package manager
  if (check('pnpm-lock.yaml')) profile.packageManager = 'pnpm';
  else if (check('yarn.lock')) profile.packageManager = 'yarn';
  else if (check('bun.lockb')) profile.packageManager = 'bun';
  else if (check('package-lock.json')) profile.packageManager = 'npm';

  // Monorepo (additional checks)
  if (!profile.isMonorepo) {
    if (check('pnpm-workspace.yaml') || check('turbo.json') || check('nx.json')) {
      profile.isMonorepo = true;
    }
  }

  return profile;
}

// ── Stack description ──────────────────────────────────────────────────

export function describeStack(profile: CodebaseProfile): string {
  const parts: string[] = [];
  if (profile.language) parts.push(profile.language.charAt(0).toUpperCase() + profile.language.slice(1));
  if (profile.framework) parts.push(profile.framework.charAt(0).toUpperCase() + profile.framework.slice(1));
  if (profile.orm) parts.push(profile.orm);
  return parts.join(' + ') || 'Unknown';
}

// ── Skill suggestion ───────────────────────────────────────────────────

export function suggestSkillNames(profile: CodebaseProfile, projectRoot: string): string[] {
  const skills: string[] = [];

  if (profile.framework === 'nextjs') skills.push('nextjs');
  if (profile.language === 'typescript') skills.push('typescript');
  if (profile.framework === 'fastapi') skills.push('python-fastapi');

  // Check for tailwind
  const pkgPath = join(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = readJsonSafe(pkgPath);
    if (pkg && hasDep(pkg, 'tailwindcss')) skills.push('tailwind');
  }

  return skills;
}
