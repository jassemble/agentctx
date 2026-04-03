import { join, basename, relative } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

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

// ── Workspace resolution ──────────────────────────────────────────────

export interface WorkspacePackage {
  name: string;         // display name: "web", "backend"
  directory: string;    // absolute path to workspace root
  relativePath: string; // relative to monorepo root: "apps/web"
}

/**
 * Expand a single workspace glob pattern into directory paths (relative to projectRoot).
 * Handles: "apps/*", "packages/**", "tools/cli" (literal).
 */
function expandWorkspaceGlob(projectRoot: string, pattern: string): string[] {
  pattern = pattern.replace(/\/$/, '');

  if (pattern.includes('**')) {
    // Recursive: walk all subdirectories of the prefix that contain package.json
    const prefix = pattern.split('**')[0].replace(/\/$/, '');
    const base = join(projectRoot, prefix);
    if (!existsSync(base)) return [];
    const results: string[] = [];
    function walk(dir: string): void {
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (existsSync(join(full, 'package.json'))) {
          results.push(relative(projectRoot, full));
        }
        walk(full);
      }
    }
    walk(base);
    return results;
  }

  if (pattern.includes('*')) {
    // Single-level wildcard: list immediate child directories of the prefix
    const prefix = pattern.split('*')[0].replace(/\/$/, '');
    const base = join(projectRoot, prefix);
    if (!existsSync(base)) return [];
    try {
      return readdirSync(base, { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
        .map(e => prefix ? `${prefix}/${e.name}`.replace(/^\//, '') : e.name);
    } catch { return []; }
  }

  // Literal path
  return [pattern];
}

/**
 * Resolve workspace packages from package.json workspaces and/or pnpm-workspace.yaml.
 * Returns only directories that exist and contain a package.json.
 */
export function resolveWorkspaces(projectRoot: string): WorkspacePackage[] {
  const globs: string[] = [];

  // 1. package.json workspaces
  const pkgPath = join(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = readJsonSafe(pkgPath);
    if (pkg) {
      const ws = pkg.workspaces;
      if (Array.isArray(ws)) {
        globs.push(...ws.map(String));
      } else if (ws && typeof ws === 'object' && Array.isArray((ws as Record<string, unknown>).packages)) {
        globs.push(...((ws as Record<string, unknown>).packages as string[]));
      }
    }
  }

  // 2. pnpm-workspace.yaml
  const pnpmPath = join(projectRoot, 'pnpm-workspace.yaml');
  if (existsSync(pnpmPath)) {
    try {
      const content = readFileSync(pnpmPath, 'utf-8');
      const parsed = parseYaml(content) as Record<string, unknown>;
      if (Array.isArray(parsed.packages)) {
        globs.push(...parsed.packages.filter((p): p is string => typeof p === 'string'));
      }
    } catch { /* ignore */ }
  }

  // Deduplicate globs
  const uniqueGlobs = Array.from(new Set(globs));

  // 3. Expand globs → relative directory paths
  const allPaths: string[] = [];
  for (const g of uniqueGlobs) {
    // Skip negation patterns (e.g., "!packages/internal")
    if (g.startsWith('!')) continue;
    allPaths.push(...expandWorkspaceGlob(projectRoot, g));
  }

  // Deduplicate paths
  const uniquePaths = Array.from(new Set(allPaths));

  // 4. Filter: must exist and contain package.json
  const validPaths = uniquePaths.filter(rel => {
    const abs = join(projectRoot, rel);
    return existsSync(abs) && existsSync(join(abs, 'package.json'));
  });

  // 5. Build WorkspacePackage objects
  const packages: WorkspacePackage[] = [];
  const usedNames = new Set<string>();

  for (const rel of validPaths) {
    const abs = join(projectRoot, rel);
    let name = basename(rel);

    // Try to read name from workspace's package.json
    const wsPkg = readJsonSafe(join(abs, 'package.json'));
    if (wsPkg && typeof wsPkg.name === 'string') {
      let pkgName = wsPkg.name as string;
      // Strip scope: "@org/web" → "web"
      if (pkgName.startsWith('@') && pkgName.includes('/')) {
        pkgName = pkgName.split('/')[1];
      }
      name = pkgName;
    }

    // Handle name collisions
    if (usedNames.has(name)) {
      name = rel.replace(/\//g, '-');
    }
    usedNames.add(name);

    packages.push({ name, directory: abs, relativePath: rel });
  }

  return packages;
}
