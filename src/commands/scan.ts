import { join, basename, resolve } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../utils/logger.js';
import { spawnWithStdin } from '../utils/exec.js';
import { resolveWorkspaces, type WorkspacePackage } from '../core/detector.js';

const execFileAsync = promisify(execFile);

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

interface ScanOptions {
  ai?: boolean;
  suggestSkills?: boolean;
  deep?: boolean;
  modules?: boolean; // default true, --no-modules to skip
}

interface AiModule {
  filename: string;
  title: string;
  content: string;
}

// ── Heuristic detection ────────────────────────────────────────────────

function readJsonSafe(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function hasDep(pkg: Record<string, unknown>, name: string): boolean {
  const deps = (pkg.dependencies ?? {}) as Record<string, string>;
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
  return name in deps || name in devDeps;
}

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
    // Read pyproject.toml for framework detection
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

// ── Skill suggestion mapping ───────────────────────────────────────────

function suggestSkillNames(
  profile: CodebaseProfile,
  wsProfiles?: Map<string, CodebaseProfile>,
  wsPackages?: WorkspacePackage[],
): string[] {
  const skills = new Set<string>();

  // Check root profile
  addSkillsFromProfile(skills, profile, process.cwd());

  // Check workspace profiles
  if (wsProfiles && wsPackages) {
    for (const ws of wsPackages) {
      const wsProfile = wsProfiles.get(ws.name);
      if (wsProfile) addSkillsFromProfile(skills, wsProfile, ws.directory);
    }
  }

  return Array.from(skills);
}

function addSkillsFromProfile(skills: Set<string>, profile: CodebaseProfile, dir: string): void {
  if (profile.framework === 'nextjs') skills.add('nextjs');
  if (profile.language === 'typescript') skills.add('typescript');
  if (profile.framework === 'fastapi') skills.add('python-fastapi');

  const pkgPath = join(dir, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = readJsonSafe(pkgPath);
    if (pkg && hasDep(pkg, 'tailwindcss')) skills.add('tailwind');
  }
}

function printProfile(profile: CodebaseProfile): void {
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

  const lines: [string, string | null][] = [
    ['Language', profile.language],
    ['Framework', profile.framework],
    ['Test Runner', profile.testRunner],
    ['Linter', profile.linter],
    ['ORM', profile.orm],
    ['CI', profile.ci],
    ['Pkg Manager', profile.packageManager],
  ];

  console.log('');
  console.log('  Detected:');
  for (const [label, value] of lines) {
    if (value) {
      console.log(`    ${dim(label + ':')}  ${cyan(value)}`);
    }
  }
  if (profile.isMonorepo) {
    console.log(`    ${dim('Monorepo:')}  ${cyan('yes')}`);
  }
  console.log('');
}

// ── AI analysis ────────────────────────────────────────────────────────

function getDirectoryTree(root: string, depth: number = 0, maxDepth: number = 2): string {
  if (depth > maxDepth) return '';
  const IGNORE = new Set(['node_modules', '.git', '.next', '__pycache__', 'dist', '.agentctx', '.turbo', '.cache', 'coverage']);

  let tree = '';
  try {
    const entries = readdirSync(root, { withFileTypes: true });
    const indent = '  '.repeat(depth);
    for (const entry of entries) {
      if (IGNORE.has(entry.name)) continue;
      if (entry.isDirectory()) {
        tree += `${indent}${entry.name}/\n`;
        tree += getDirectoryTree(join(root, entry.name), depth + 1, maxDepth);
      } else if (depth <= 1) {
        tree += `${indent}${entry.name}\n`;
      }
    }
  } catch { /* ignore */ }
  return tree;
}

function pickRepresentativeFiles(projectRoot: string): string[] {
  const candidates = ['src', 'app', 'lib', 'pages'];
  const files: string[] = [];

  for (const dir of candidates) {
    const fullDir = join(projectRoot, dir);
    if (!existsSync(fullDir)) continue;
    try {
      const entries = readdirSync(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!/\.(ts|tsx|js|jsx|py|go|rs)$/.test(entry.name)) continue;
        // Skip test files, index files, config files
        if (/\.(test|spec|config)\./i.test(entry.name)) continue;
        files.push(join(dir, entry.name));
        if (files.length >= 3) return files;
      }
    } catch { /* ignore */ }
  }

  return files;
}

const AI_SYSTEM_PROMPT = `You are a codebase analyzer. Given a project's directory structure, config files, and sample source code, generate context modules that describe the project for AI coding assistants.

Produce ONLY valid JSON — an array of objects with this schema:
[
  {
    "filename": "architecture.md",
    "title": "Architecture",
    "content": "# Architecture\\n\\nDescription of the project architecture..."
  }
]

Generate 2-4 modules from this list (only include ones you have enough info to write meaningfully):
- architecture.md — Project structure, key directories, how code is organized
- testing.md — Testing framework, patterns, how to run tests
- style.md — Code style conventions observed in the source files
- patterns.md — Key patterns and conventions used (state management, error handling, etc.)

Rules:
- Be specific to THIS project, not generic advice
- Use markdown with clear headings
- Keep each module focused and concise (200-500 words)
- Reference actual file paths and patterns you see in the code
- content field should use \\n for newlines (valid JSON string)`;

async function runAiAnalysis(projectRoot: string): Promise<AiModule[] | null> {
  // Check claude CLI is available
  try {
    await execFileAsync('claude', ['--version'], { timeout: 5000 });
  } catch {
    logger.warn('claude CLI not found — install Claude Code to enable AI analysis');
    return null;
  }

  logger.info('Gathering codebase context for AI analysis...');

  // Build context payload
  const sections: string[] = [];

  // 1. Directory tree
  const tree = getDirectoryTree(projectRoot);
  sections.push(`## Directory Structure\n\`\`\`\n${tree}\`\`\``);

  // 2. Package manifest
  for (const manifest of ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml']) {
    const p = join(projectRoot, manifest);
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, 'utf-8');
        sections.push(`## ${manifest}\n\`\`\`\n${content}\`\`\``);
      } catch { /* ignore */ }
      break;
    }
  }

  // 3. Config files
  for (const cfg of ['tsconfig.json', 'next.config.js', 'next.config.mjs', 'next.config.ts', 'vite.config.ts', 'tailwind.config.ts', 'tailwind.config.js']) {
    const p = join(projectRoot, cfg);
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, 'utf-8');
        sections.push(`## ${cfg}\n\`\`\`\n${content}\`\`\``);
      } catch { /* ignore */ }
    }
  }

  // 4. Representative source files
  const repFiles = pickRepresentativeFiles(projectRoot);
  for (const relPath of repFiles) {
    try {
      const content = readFileSync(join(projectRoot, relPath), 'utf-8');
      // Cap each file at ~200 lines
      const trimmed = content.split('\n').slice(0, 200).join('\n');
      sections.push(`## ${relPath}\n\`\`\`\n${trimmed}\`\`\``);
    } catch { /* ignore */ }
  }

  const payload = sections.join('\n\n');

  try {
    logger.info('Running AI analysis (this may take a moment)...');
    const stdout = await spawnWithStdin('claude', [
      '--print',
      '--model', 'sonnet',
      '--system-prompt', AI_SYSTEM_PROMPT,
    ], payload, 120000);

    // Parse JSON from response
    const jsonMatch = stdout.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn('AI analysis returned unparseable response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as AiModule[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      logger.warn('AI analysis returned empty results');
      return null;
    }

    // Validate shape
    for (const mod of parsed) {
      if (typeof mod.filename !== 'string' || typeof mod.content !== 'string') {
        logger.warn('AI analysis returned malformed module');
        return null;
      }
    }

    return parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`AI analysis failed: ${msg}`);
    return null;
  }
}

// ── Main command ───────────────────────────────────────────────────────

export async function scanCommand(options: ScanOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Phase 1: Heuristic detection (always runs)
  const profile = analyzeCodebase(projectRoot);
  printProfile(profile);

  // Resolve workspaces for monorepos
  let workspaces: WorkspacePackage[] = [];
  const workspaceProfiles = new Map<string, CodebaseProfile>();

  if (profile.isMonorepo) {
    workspaces = resolveWorkspaces(projectRoot);

    if (workspaces.length > 0) {
      const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
      const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

      // Per-workspace profiling
      for (const ws of workspaces) {
        workspaceProfiles.set(ws.name, analyzeCodebase(ws.directory));
      }

      console.log(`  Workspaces (${workspaces.length}):`);
      for (const ws of workspaces) {
        const wsProfile = workspaceProfiles.get(ws.name)!;
        const parts: string[] = [];
        if (wsProfile.framework) parts.push(wsProfile.framework);
        else if (wsProfile.language) parts.push(wsProfile.language);
        if (wsProfile.orm) parts.push(wsProfile.orm);
        const stack = parts.join(' + ') || 'unknown';
        console.log(`    ${dim(ws.relativePath + ':')}  ${cyan(stack)}`);
      }
      console.log('');
    }
  }

  const suggestedSkills = suggestSkillNames(profile, workspaceProfiles, workspaces);

  if (suggestedSkills.length > 0) {
    const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
    const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
    console.log(`  Suggested skills: ${bold(`agentctx init ${suggestedSkills.join(' ')}`)}`);
    console.log('');
  }

  // If --suggest-skills, stop here
  if (options.suggestSkills) {
    return;
  }

  // Phase 2: Deep code map (--deep)
  if (options.deep) {
    const agentctxDir = join(projectRoot, '.agentctx');
    if (!existsSync(agentctxDir)) {
      logger.warn('No .agentctx/ found. Run `agentctx init` first.');
      return;
    }

    const { scanCodeMap, renderCodeMapMarkdown } = await import('../core/code-map.js');

    logger.info('Scanning codebase for API routes, hooks, services...');
    const codeMap = await scanCodeMap(projectRoot, profile);

    const total = codeMap.apiRoutes.length + codeMap.hooks.length + codeMap.services.length + codeMap.errorBoundaries.length;
    if (total === 0) {
      logger.warn('No API routes, hooks, or services detected.');
      return;
    }

    const markdown = renderCodeMapMarkdown(codeMap);

    // Write to .agentctx/context/modules/code-map.md
    const { mkdir } = await import('node:fs/promises');
    const modulesDir = join(agentctxDir, 'context', 'modules');
    await mkdir(modulesDir, { recursive: true });
    const codeMapPath = join(modulesDir, 'code-map.md');
    await writeFile(codeMapPath, markdown, 'utf-8');

    // Update config.yaml to include the module
    const configPath = join(agentctxDir, 'config.yaml');
    if (existsSync(configPath)) {
      try {
        const configContent = await readFile(configPath, 'utf-8');
        const config = parseYaml(configContent) as Record<string, unknown>;
        const existingContext = (config.context ?? []) as string[];
        const contextEntry = 'context/modules/code-map.md';

        if (!existingContext.includes(contextEntry)) {
          existingContext.push(contextEntry);
          config.context = existingContext;
          await writeFile(configPath, toYaml(config, { lineWidth: 100 }), 'utf-8');
          logger.success('Added code-map.md to config.yaml');
        }
      } catch (err) {
        logger.warn(`Could not update config.yaml: ${err instanceof Error ? err.message : err}`);
      }
    }

    logger.success(`Code map generated: ${codeMap.apiRoutes.length} routes, ${codeMap.hooks.length} hooks, ${codeMap.services.length} services, ${codeMap.errorBoundaries.length} error boundaries`);
    logger.dim('Run `agentctx generate` to include code map in CLAUDE.md output.');
    console.log('');
    return;
  }

  // Phase 3: Static analysis modules (runs by default, skip with --no-modules)
  if (options.modules !== false) {
    const agentctxDir = join(projectRoot, '.agentctx');
    if (!existsSync(agentctxDir)) {
      logger.warn('No .agentctx/ found. Run `agentctx init` first.');
      return;
    }

    const { discoverFeatures } = await import('../core/feature-discovery.js');
    const { analyzeFile } = await import('../core/ast-analyzer.js');
    const { assembleModule, assembleRootModule, computeSourceHash } = await import('../core/module-assembler.js');
    const { mkdir } = await import('node:fs/promises');
    const { dirname: pathDirname } = await import('node:path');

    logger.info('Discovering feature boundaries...');
    const featureMap = await discoverFeatures(projectRoot, profile, workspaces);

    if (featureMap.features.length === 0 && featureMap.rootFiles.length === 0) {
      logger.warn('No features detected. Ensure your project has source files in src/, app/, lib/, or components/.');
      return;
    }

    logger.info(`Found ${featureMap.features.length} module(s). Analyzing with TypeScript AST...`);

    // Analyze all files
    const allAnalyses = new Map<string, Awaited<ReturnType<typeof analyzeFile>>>();
    const allFiles = [
      ...featureMap.features.flatMap(f => f.files),
      ...featureMap.rootFiles,
    ];

    let analyzed = 0;
    for (const file of allFiles) {
      try {
        const analysis = analyzeFile(join(projectRoot, file));
        allAnalyses.set(file, { ...analysis, filePath: file });
        analyzed++;
      } catch {
        // Skip files that fail to parse
      }
    }

    logger.dim(`Analyzed ${analyzed} file(s)`);

    // Generate modules — mirroring source directory structure
    const modulesDir = join(agentctxDir, 'context', 'modules');

    const writtenModules: string[] = [];
    const allAnalysesArray = Array.from(allAnalyses.values());

    let totalTypes = 0;
    let totalFunctions = 0;
    let totalComponents = 0;
    let skipped = 0;

    // Helper: extract enrichment fields from existing module frontmatter
    function parseEnrichmentFields(content: string): { sourceHash?: string; enrichedAt?: string; enrichedHash?: string } {
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) return {};
      const fm = fmMatch[1];
      const getField = (key: string) => {
        const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
        return m?.[1]?.trim();
      };
      return {
        sourceHash: getField('source-hash'),
        enrichedAt: getField('enriched-at'),
        enrichedHash: getField('enriched-hash'),
      };
    }

    for (const feature of featureMap.features) {
      const featureAnalyses = feature.files
        .map(f => allAnalyses.get(f))
        .filter((a): a is NonNullable<typeof a> => a !== undefined);

      if (featureAnalyses.length === 0) continue;

      const moduleFile = `${feature.modulePath}.md`;
      const fullPath = join(modulesDir, moduleFile);

      // Incremental: check if module is unchanged
      const newHash = computeSourceHash(projectRoot, feature.files);
      let extraFrontmatter: Record<string, string> | undefined;

      if (existsSync(fullPath)) {
        try {
          const existing = readFileSync(fullPath, 'utf-8');
          const fields = parseEnrichmentFields(existing);

          // Skip if source files unchanged
          if (fields.sourceHash === newHash) {
            skipped++;
            writtenModules.push(`context/modules/${moduleFile}`);
            totalTypes += featureAnalyses.flatMap(a => a.types).filter(t => t.exported).length;
            totalFunctions += featureAnalyses.flatMap(a => a.functions).filter(f => f.exported).length;
            totalComponents += featureAnalyses.flatMap(a => a.components).length;
            continue;
          }

          // Source changed — carry forward enrichment markers (now stale)
          if (fields.enrichedAt && fields.enrichedHash) {
            extraFrontmatter = {
              'enriched-at': fields.enrichedAt,
              'enriched-hash': fields.enrichedHash,
            };
          }
        } catch { /* proceed with full write */ }
      }

      const markdown = assembleModule(
        feature,
        featureAnalyses,
        featureMap.features,
        allAnalysesArray,
        projectRoot,
        extraFrontmatter ? { extraFrontmatter } : undefined,
      );

      await mkdir(pathDirname(fullPath), { recursive: true });
      await writeFile(fullPath, markdown, 'utf-8');
      writtenModules.push(`context/modules/${moduleFile}`);

      totalTypes += featureAnalyses.flatMap(a => a.types).filter(t => t.exported).length;
      totalFunctions += featureAnalyses.flatMap(a => a.functions).filter(f => f.exported).length;
      totalComponents += featureAnalyses.flatMap(a => a.components).length;

      logger.success(`Module: ${feature.modulePath} (${feature.files.length} files)`);
    }

    // Generate root module for files at source roots (app/layout.tsx, app/page.tsx)
    if (featureMap.rootFiles.length > 0) {
      const rootPath = join(modulesDir, '_root.md');
      const newRootHash = computeSourceHash(projectRoot, featureMap.rootFiles);
      let rootExtraFm: Record<string, string> | undefined;
      let skipRoot = false;

      if (existsSync(rootPath)) {
        try {
          const existing = readFileSync(rootPath, 'utf-8');
          const fields = parseEnrichmentFields(existing);
          if (fields.sourceHash === newRootHash) {
            skipRoot = true;
            skipped++;
            writtenModules.push('context/modules/_root.md');
          } else if (fields.enrichedAt && fields.enrichedHash) {
            rootExtraFm = { 'enriched-at': fields.enrichedAt, 'enriched-hash': fields.enrichedHash };
          }
        } catch { /* proceed */ }
      }

      if (!skipRoot) {
        const rootMarkdown = assembleRootModule(
          featureMap.rootFiles,
          allAnalysesArray,
          projectRoot,
          rootExtraFm ? { extraFrontmatter: rootExtraFm } : undefined,
        );
        if (rootMarkdown) {
          await mkdir(pathDirname(rootPath), { recursive: true });
          await writeFile(rootPath, rootMarkdown, 'utf-8');
          writtenModules.push('context/modules/_root.md');
          logger.success(`Module: _root (${featureMap.rootFiles.length} files)`);
        }
      }
    }

    if (skipped > 0) {
      logger.dim(`Skipped ${skipped} unchanged module(s)`);
    }

    // Update config.yaml
    const configPath = join(agentctxDir, 'config.yaml');
    if (existsSync(configPath)) {
      try {
        const configContent = await readFile(configPath, 'utf-8');
        const config = parseYaml(configContent) as Record<string, unknown>;
        const existingContext = (config.context ?? []) as string[];

        let added = 0;
        for (const mod of writtenModules) {
          if (!existingContext.includes(mod)) {
            existingContext.push(mod);
            added++;
          }
        }
        if (added > 0) {
          config.context = existingContext;
          await writeFile(configPath, toYaml(config, { lineWidth: 100 }), 'utf-8');
          logger.success(`Added ${added} module(s) to config.yaml`);
        }
      } catch (err) {
        logger.warn(`Could not update config.yaml: ${err instanceof Error ? err.message : err}`);
      }
    }

    console.log('');
    logger.info(`Summary: ${writtenModules.length} modules — ${totalTypes} types, ${totalFunctions} functions, ${totalComponents} components`);
    console.log('');
  }

  // Phase 4: AI analysis (opt-in with --ai)
  if (!options.ai) {
    return;
  }

  const agentctxDir = join(projectRoot, '.agentctx');
  if (!existsSync(agentctxDir)) {
    logger.warn('No .agentctx/ found. Run `agentctx init` first, or use `--suggest-skills` to see recommendations.');
    return;
  }

  const modules = await runAiAnalysis(projectRoot);
  if (!modules) return;

  // Write modules to .agentctx/context/
  const contextDir = join(agentctxDir, 'context');
  const writtenFiles: string[] = [];

  for (const mod of modules) {
    const filePath = join(contextDir, mod.filename);
    await writeFile(filePath, mod.content, 'utf-8');
    writtenFiles.push(`context/${mod.filename}`);
    logger.success(`Wrote ${mod.filename}`);
  }

  // Update config.yaml to include new modules
  const configPath = join(agentctxDir, 'config.yaml');
  if (existsSync(configPath)) {
    try {
      const configContent = await readFile(configPath, 'utf-8');
      const config = parseYaml(configContent) as Record<string, unknown>;
      const existingContext = (config.context ?? []) as string[];

      // Add new files that aren't already listed
      for (const f of writtenFiles) {
        if (!existingContext.includes(f)) {
          existingContext.push(f);
        }
      }
      config.context = existingContext;

      await writeFile(configPath, toYaml(config, { lineWidth: 100 }), 'utf-8');
      logger.success('Updated config.yaml');
    } catch (err) {
      logger.warn(`Could not update config.yaml: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('');
  logger.dim('Review generated files in .agentctx/context/ and run `agentctx generate` to update outputs.');
}
