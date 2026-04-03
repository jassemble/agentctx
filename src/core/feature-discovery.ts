import { join, relative, dirname, basename, extname } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import type { CodebaseProfile, WorkspacePackage } from './detector.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface FeatureBoundary {
  name: string;        // display name: "auth", "theme"
  modulePath: string;  // mirrors source structure: "app/auth/login", "components/theme"
  directory: string;   // common source directory: "app/(auth)/login"
  files: string[];
  entryPoint?: string;
}

export interface FeatureMap {
  features: FeatureBoundary[];
  rootFiles: string[];  // files at root of source dirs (app/layout.tsx, app/page.tsx)
}

// ── Constants ──────────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', '__pycache__', 'dist', '.agentctx',
  '.turbo', '.cache', 'coverage', '.vercel', 'build', 'out',
]);

const SHARED_DIRS = new Set([
  'utils', 'helpers', 'types', 'shared', 'common', 'config',
  'constants', 'generated',
]);

const SOURCE_EXTS = /\.(ts|tsx|js|jsx)$/;

const SOURCE_ROOTS = ['src', 'app', 'lib', 'components', 'pages', 'hooks', 'services'];

// ── Helpers ────────────────────────────────────────────────────────────

function walkSourceFiles(dir: string, root: string, maxFiles = 500): string[] {
  const results: string[] = [];

  function walk(current: string): void {
    if (results.length >= maxFiles) return;
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(join(current, entry.name));
        }
      } else if (SOURCE_EXTS.test(entry.name)) {
        if (/\.(test|spec)\./i.test(entry.name)) continue;
        results.push(relative(root, join(current, entry.name)));
      }
    }
  }

  if (existsSync(dir)) walk(dir);
  return results;
}

/**
 * Strip Next.js route group parentheses: (auth) → auth
 */
function stripRouteGroup(segment: string): string {
  return segment.replace(/^\(([^)]+)\)$/, '$1');
}

function stripRouteGroups(path: string): string {
  return path.split('/').map(stripRouteGroup).join('/');
}

function toKebabCase(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function findEntryPoint(files: string[]): string | undefined {
  const indexFiles = files.filter(f => {
    const base = basename(f, extname(f));
    return base === 'index' || base === 'main' || base === 'mod';
  });
  return indexFiles[0];
}

// ── Classification ─────────────────────────────────────────────────────

/**
 * Returns the module path for a file, mirroring the source directory structure.
 *
 * Examples:
 *   app/(auth)/login/page.tsx      → "app/auth/login"
 *   app/actions/auth.ts            → "app/actions"
 *   components/theme/provider.tsx   → "components/theme"
 *   components/layout/header.tsx    → "components/layout"
 *   lib/auth.ts                     → "lib/auth"
 *   lib/mock-data.ts                → "lib/mock-data"
 *   src/features/billing/index.ts   → "src/features/billing"
 *   app/layout.tsx                  → null (root file)
 *   middleware.ts                   → null (root file)
 */
function classifyFile(file: string): string | null {
  const parts = file.split('/');

  // Root-level files (middleware.ts, etc.) → root files
  if (parts.length === 1) return null;

  const sourceRoot = parts[0];

  // Files directly under a source root (app/layout.tsx, lib/auth.ts)
  if (parts.length === 2) {
    // For lib/, each file is its own module since they're standalone
    if (['lib', 'services', 'hooks'].includes(sourceRoot)) {
      const stem = basename(parts[1], extname(parts[1]));
      return `${sourceRoot}/${toKebabCase(stem)}`;
    }
    // For app/, components/ — files at root are root files
    return null;
  }

  // Deeper paths: use sourceRoot + first meaningful subdirectory path
  // Strip route group parentheses for the module path
  const dir = dirname(file);
  const cleanDir = stripRouteGroups(dir);

  // Check if any segment is a shared dir — if so, still mirror it
  // (utils, helpers etc. still get their own module)

  return cleanDir;
}

// ── Main Discovery ─────────────────────────────────────────────────────

/**
 * Discover features in a single directory root (the original non-monorepo path).
 * File paths are relative to `relativeRoot`.
 */
function discoverFeaturesForSingleRoot(
  scanDir: string,
  relativeRoot: string,
): { features: FeatureBoundary[]; rootFiles: string[] } {
  const allFiles: string[] = [];
  for (const dir of SOURCE_ROOTS) {
    const fullDir = join(scanDir, dir);
    if (existsSync(fullDir)) {
      allFiles.push(...walkSourceFiles(fullDir, relativeRoot));
    }
  }

  // Also pick up files at root level (e.g. middleware.ts)
  try {
    const rootEntries = readdirSync(scanDir, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isFile() && SOURCE_EXTS.test(entry.name) && !entry.name.startsWith('.')) {
        if (!/\.(test|spec|config)\./i.test(entry.name)) {
          allFiles.push(relative(relativeRoot, join(scanDir, entry.name)));
        }
      }
    }
  } catch { /* ignore */ }

  const files = Array.from(new Set(allFiles));

  const moduleGroups = new Map<string, string[]>();
  const rootFiles: string[] = [];

  for (const file of files) {
    const modulePath = classifyFile(file);
    if (modulePath === null) {
      rootFiles.push(file);
    } else {
      const existing = moduleGroups.get(modulePath) ?? [];
      existing.push(file);
      moduleGroups.set(modulePath, existing);
    }
  }

  const features: FeatureBoundary[] = [];

  for (const [modulePath, groupFiles] of moduleGroups) {
    const segments = modulePath.split('/');
    const name = toKebabCase(segments[segments.length - 1]);
    const directory = findCommonDirectory(groupFiles);

    features.push({
      name,
      modulePath,
      directory,
      files: groupFiles,
      entryPoint: findEntryPoint(groupFiles),
    });
  }

  return { features, rootFiles };
}

/**
 * Discover features inside a single workspace package, namespacing module paths.
 * File paths are relative to monorepoRoot (for AST analyzer compatibility).
 */
function discoverWorkspaceFeatures(
  monorepoRoot: string,
  workspace: WorkspacePackage,
): { features: FeatureBoundary[]; rootFiles: string[] } {
  const allFiles: string[] = [];

  for (const dir of SOURCE_ROOTS) {
    const fullDir = join(workspace.directory, dir);
    if (existsSync(fullDir)) {
      // Paths relative to monorepo root so AST analyzer can resolve them
      allFiles.push(...walkSourceFiles(fullDir, monorepoRoot));
    }
  }

  // Root-level files in the workspace (e.g. apps/web/middleware.ts)
  try {
    const entries = readdirSync(workspace.directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && SOURCE_EXTS.test(entry.name) && !entry.name.startsWith('.')) {
        if (!/\.(test|spec|config)\./i.test(entry.name)) {
          allFiles.push(relative(monorepoRoot, join(workspace.directory, entry.name)));
        }
      }
    }
  } catch { /* ignore */ }

  const files = Array.from(new Set(allFiles));

  const moduleGroups = new Map<string, string[]>();
  const rootFiles: string[] = [];

  for (const file of files) {
    // Classify using path relative to the workspace root (not monorepo root)
    const wsRelative = relative(workspace.directory, join(monorepoRoot, file));
    const modulePath = classifyFile(wsRelative);

    if (modulePath === null) {
      rootFiles.push(file); // still monorepo-root-relative
    } else {
      // Namespace with workspace name: "src/auth" → "web/src/auth"
      const namespacedPath = `${workspace.name}/${modulePath}`;
      const existing = moduleGroups.get(namespacedPath) ?? [];
      existing.push(file); // monorepo-root-relative
      moduleGroups.set(namespacedPath, existing);
    }
  }

  const features: FeatureBoundary[] = [];

  for (const [modulePath, groupFiles] of moduleGroups) {
    const segments = modulePath.split('/');
    const name = toKebabCase(segments[segments.length - 1]);
    const directory = findCommonDirectory(groupFiles);

    features.push({
      name,
      modulePath,
      directory,
      files: groupFiles,
      entryPoint: findEntryPoint(groupFiles),
    });
  }

  return { features, rootFiles };
}

export async function discoverFeatures(
  root: string,
  _profile: CodebaseProfile,
  workspaces?: WorkspacePackage[],
): Promise<FeatureMap> {
  if (!workspaces || workspaces.length === 0) {
    // Non-monorepo: scan root directory only (existing behavior)
    const result = discoverFeaturesForSingleRoot(root, root);
    result.features.sort((a, b) => a.modulePath.localeCompare(b.modulePath));
    return result;
  }

  // Monorepo: scan root + each workspace
  const allFeatures: FeatureBoundary[] = [];
  const allRootFiles: string[] = [];

  // Scan monorepo root (may have shared code)
  const rootResult = discoverFeaturesForSingleRoot(root, root);
  allFeatures.push(...rootResult.features);
  allRootFiles.push(...rootResult.rootFiles);

  // Scan each workspace
  for (const ws of workspaces) {
    const wsResult = discoverWorkspaceFeatures(root, ws);
    allFeatures.push(...wsResult.features);
    allRootFiles.push(...wsResult.rootFiles);
  }

  allFeatures.sort((a, b) => a.modulePath.localeCompare(b.modulePath));

  return { features: allFeatures, rootFiles: allRootFiles };
}

function findCommonDirectory(files: string[]): string {
  if (files.length === 0) return '';
  if (files.length === 1) return dirname(files[0]);

  const dirs = files.map(f => dirname(f));
  const first = dirs[0].split('/');

  let common = 0;
  for (let i = 0; i < first.length; i++) {
    if (dirs.every(d => d.split('/')[i] === first[i])) {
      common = i + 1;
    } else {
      break;
    }
  }

  return first.slice(0, common).join('/') || dirs[0];
}
