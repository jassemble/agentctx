import { resolve, join, basename, extname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { stringify as toYaml } from 'yaml';
import * as p from '@clack/prompts';
import { logger } from '../utils/logger.js';

interface InitOptions {
  import?: boolean;
  interactive?: boolean;
  force?: boolean;
}

interface DetectedFile {
  name: string;
  path: string;
  type: 'claude' | 'cursorrules' | 'copilot' | 'agents';
}

interface DetectedProject {
  language?: string;
  framework?: string;
}

const KNOWN_FILES: { pattern: string; type: DetectedFile['type']; label: string }[] = [
  { pattern: 'CLAUDE.md', type: 'claude', label: 'CLAUDE.md (Claude Code)' },
  { pattern: '.cursorrules', type: 'cursorrules', label: '.cursorrules (Cursor IDE)' },
  { pattern: '.github/copilot-instructions.md', type: 'copilot', label: 'copilot-instructions.md (GitHub Copilot)' },
  { pattern: 'AGENTS.md', type: 'agents', label: 'AGENTS.md' },
];

function detectExistingFiles(projectRoot: string): DetectedFile[] {
  const found: DetectedFile[] = [];
  for (const entry of KNOWN_FILES) {
    const fullPath = join(projectRoot, entry.pattern);
    if (existsSync(fullPath)) {
      found.push({ name: entry.label, path: fullPath, type: entry.type });
    }
  }
  return found;
}

function detectProject(projectRoot: string): DetectedProject {
  const result: DetectedProject = {};

  const pkgPath = join(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      result.language = 'typescript';
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['next']) result.framework = 'nextjs';
      else if (deps['react']) result.framework = 'react';
      else if (deps['vue']) result.framework = 'vue';
      else if (deps['svelte'] || deps['@sveltejs/kit']) result.framework = 'svelte';
      else if (deps['express']) result.framework = 'express';
      else if (deps['hono']) result.framework = 'hono';
      if (!deps['typescript'] && !pkg.devDependencies?.['typescript']) {
        result.language = 'javascript';
      }
    } catch { /* ignore */ }
  }

  if (!result.language && existsSync(join(projectRoot, 'pyproject.toml'))) {
    result.language = 'python';
  }
  if (!result.language && existsSync(join(projectRoot, 'go.mod'))) {
    result.language = 'go';
  }
  if (!result.language && existsSync(join(projectRoot, 'Cargo.toml'))) {
    result.language = 'rust';
  }

  return result;
}

function splitByHeadings(content: string): { title: string; body: string }[] {
  const lines = content.split('\n');
  const sections: { title: string; body: string }[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^#{1,2}\s+(.+)$/);
    if (match) {
      if (currentTitle || currentLines.length > 0) {
        sections.push({
          title: currentTitle || 'General',
          body: currentLines.join('\n').trim(),
        });
      }
      currentTitle = match[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentTitle || currentLines.length > 0) {
    sections.push({
      title: currentTitle || 'General',
      body: currentLines.join('\n').trim(),
    });
  }

  return sections.filter(s => s.body.length > 0);
}

function titleToFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') + '.md';
}

export async function initCommand(options: InitOptions): Promise<void> {
  const projectRoot = process.cwd();
  const agentctxDir = join(projectRoot, '.agentctx');
  const contextDir = join(agentctxDir, 'context');

  if (existsSync(agentctxDir) && !options.force) {
    logger.error('.agentctx/ already exists. Use --force to overwrite.');
    process.exit(1);
  }

  p.intro('agentctx init');

  // Detect existing context files
  const existingFiles = detectExistingFiles(projectRoot);
  const detected = detectProject(projectRoot);

  if (existingFiles.length > 0) {
    p.note(
      existingFiles.map(f => `  ${f.name}`).join('\n'),
      'Found existing context files',
    );
  }

  // Interactive prompts
  const shouldImport = existingFiles.length > 0
    ? await p.confirm({
        message: 'Import content from existing files?',
        initialValue: true,
      })
    : false;

  if (p.isCancel(shouldImport)) { p.cancel('Init cancelled.'); process.exit(0); }

  const projectName = await p.text({
    message: 'Project name?',
    initialValue: basename(projectRoot),
    validate: (v) => v.length === 0 ? 'Name is required' : undefined,
  });

  if (p.isCancel(projectName)) { p.cancel('Init cancelled.'); process.exit(0); }

  const language = await p.text({
    message: 'Primary language?',
    initialValue: detected.language || '',
    placeholder: 'typescript, python, go, rust...',
  });

  if (p.isCancel(language)) { p.cancel('Init cancelled.'); process.exit(0); }

  const framework = await p.text({
    message: 'Primary framework? (optional)',
    initialValue: detected.framework || '',
    placeholder: 'nextjs, react, fastapi...',
  });

  if (p.isCancel(framework)) { p.cancel('Init cancelled.'); process.exit(0); }

  const outputTargets = await p.multiselect({
    message: 'Which output targets?',
    options: [
      { value: 'claude', label: 'CLAUDE.md (Claude Code)', hint: 'recommended' },
      { value: 'cursorrules', label: '.cursorrules (Cursor IDE)' },
      { value: 'copilot', label: '.github/copilot-instructions.md (GitHub Copilot)' },
    ],
    initialValues: ['claude', 'cursorrules'],
    required: true,
  });

  if (p.isCancel(outputTargets)) { p.cancel('Init cancelled.'); process.exit(0); }

  // Create directories
  const s = p.spinner();
  s.start('Creating .agentctx/');

  await mkdir(contextDir, { recursive: true });

  // Import or create starter context
  const contextFiles: string[] = [];

  if (shouldImport && existingFiles.length > 0) {
    for (const file of existingFiles) {
      const content = await readFile(file.path, 'utf-8');
      const sections = splitByHeadings(content);

      for (const section of sections) {
        const filename = titleToFilename(section.title);
        const filePath = join(contextDir, filename);
        const mdContent = `# ${section.title}\n\n${section.body}\n`;
        await writeFile(filePath, mdContent, 'utf-8');
        const relativePath = `context/${filename}`;
        if (!contextFiles.includes(relativePath)) {
          contextFiles.push(relativePath);
        }
      }
    }
  }

  // If no import or no sections found, create starter files
  if (contextFiles.length === 0) {
    const starters = [
      { file: 'context/principles.md', content: '# Principles\n\nCore development principles for this project.\n' },
      { file: 'context/architecture.md', content: '# Architecture\n\nProject architecture and patterns.\n' },
      { file: 'context/testing.md', content: '# Testing\n\nTesting conventions and requirements.\n' },
      { file: 'context/style.md', content: '# Style\n\nCode style and formatting conventions.\n' },
    ];
    for (const starter of starters) {
      await writeFile(join(agentctxDir, starter.file), starter.content, 'utf-8');
      contextFiles.push(starter.file);
    }
  }

  // Build config
  const config: Record<string, unknown> = {
    version: 1,
    project: {
      name: projectName as string,
      ...(language ? { language: language as string } : {}),
      ...(framework ? { framework: framework as string } : {}),
    },
    context: contextFiles,
    outputs: {} as Record<string, unknown>,
  };

  const outputs = config.outputs as Record<string, unknown>;
  const targets = outputTargets as string[];

  if (targets.includes('claude')) {
    outputs.claude = { enabled: true, path: 'CLAUDE.md', max_tokens: 8000 };
  }
  if (targets.includes('cursorrules')) {
    outputs.cursorrules = { enabled: true, path: '.cursorrules', max_tokens: 4000 };
  }
  if (targets.includes('copilot')) {
    outputs.copilot = { enabled: true, path: '.github/copilot-instructions.md', max_tokens: 4000 };
  }

  // Write config.yaml
  const configYaml = toYaml(config, { lineWidth: 100 });
  await writeFile(join(agentctxDir, 'config.yaml'), configYaml, 'utf-8');

  s.stop('Created .agentctx/');

  // Generate outputs
  const genSpinner = p.spinner();
  genSpinner.start('Generating outputs...');

  try {
    const { loadConfig } = await import('../core/config.js');
    const { loadContextModules } = await import('../core/context.js');
    const { runGenerators } = await import('../generators/index.js');

    const loadedConfig = await loadConfig(join(agentctxDir, 'config.yaml'));
    const modules = await loadContextModules(loadedConfig, agentctxDir);
    const results = await runGenerators(modules, loadedConfig);

    for (const result of results) {
      const outPath = resolve(projectRoot, result.path);
      await writeFile(outPath, result.content, 'utf-8');
    }

    genSpinner.stop('Generated outputs');

    for (const result of results) {
      const budgetStr = result.tokenBudget
        ? ` (${Math.round((result.tokenCount / result.tokenBudget) * 100)}% of ${result.tokenBudget.toLocaleString()} budget)`
        : '';
      logger.success(`${result.path}  ${result.tokenCount.toLocaleString()} tokens${budgetStr}`);
    }
  } catch (err) {
    genSpinner.stop('Generation skipped');
    logger.warn(`Could not generate outputs: ${err instanceof Error ? err.message : err}`);
    logger.dim('Run `agentctx generate` manually after reviewing your config.');
  }

  p.outro('Done! Your context is now managed by agentctx.');

  logger.dim('\nNext steps:');
  logger.dim('  1. Review .agentctx/context/*.md and customize');
  logger.dim('  2. Run `agentctx lint` to check quality');
  logger.dim('  3. Run `agentctx generate --diff` to preview changes');
}
