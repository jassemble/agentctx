import { resolve, join, basename, extname, dirname, relative } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { stringify as toYaml } from 'yaml';
import * as p from '@clack/prompts';
import { logger } from '../utils/logger.js';
import { analyzeCodebase, describeStack, suggestSkillNames } from '../core/detector.js';
import type { CodebaseProfile } from '../core/detector.js';

interface InitOptions {
  import?: boolean;
  interactive?: boolean;
  force?: boolean;
  scan?: boolean;
  app?: string;
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

// ── Living context scaffolding ─────────────────────────────────────────

async function createLivingContext(contextDir: string): Promise<string[]> {
  // Create modules/ directory
  await mkdir(join(contextDir, 'modules'), { recursive: true });

  const livingFiles: { path: string; content: string }[] = [
    {
      path: 'architecture.md',
      content: `# Architecture

## Overview
<!-- Describe the high-level system design -->

## Directory Structure
<!-- Key directories and their purposes -->

## Data Flow
<!-- How data moves through the system -->
`,
    },
    {
      path: 'decisions.md',
      content: `# Decisions

<!-- Append new decisions at the top. Format:
## [Date] Decision Title
**Context:** Why this decision was needed
**Decision:** What was chosen
**Alternatives:** What else was considered
**Consequences:** What this means going forward
-->
`,
    },
    {
      path: 'status.md',
      content: `# Status

## In Progress
<!-- Currently being worked on -->

## Known Issues
<!-- Bugs or technical debt -->

## Recently Completed
<!-- Last few completed items with dates -->
`,
    },
  ];

  const paths: string[] = [];
  for (const file of livingFiles) {
    await writeFile(join(contextDir, file.path), file.content, 'utf-8');
    paths.push(`context/${file.path}`);
  }
  return paths;
}

// ── AI module generation ───────────────────────────────────────────────

async function generateAiModules(
  projectRoot: string,
  contextDir: string,
  contextFiles: string[],
): Promise<void> {
  const modulesDir = join(contextDir, 'modules');

  try {
    const { spawnWithStdin } = await import('../utils/exec.js');
    const { execFile: execFileCb } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFileCb);

    // Check claude CLI
    try {
      await execFileAsync('claude', ['--version'], { timeout: 5000 });
    } catch {
      logger.dim('  claude CLI not found — skipping AI module generation');
      return;
    }

    const s = p.spinner();
    s.start('Scanning codebase to generate module files...');

    // Build context: directory tree + key files
    const IGNORE = new Set(['node_modules', '.git', '.next', '__pycache__', 'dist', '.agentctx', '.turbo', '.cache', 'coverage']);

    function getTree(root: string, depth = 0, maxDepth = 2): string {
      if (depth > maxDepth) return '';
      let tree = '';
      try {
        for (const entry of readdirSync(root, { withFileTypes: true })) {
          if (IGNORE.has(entry.name)) continue;
          const indent = '  '.repeat(depth);
          if (entry.isDirectory()) {
            tree += `${indent}${entry.name}/\n`;
            tree += getTree(join(root, entry.name), depth + 1, maxDepth);
          } else if (depth <= 1) {
            tree += `${indent}${entry.name}\n`;
          }
        }
      } catch { /* ignore */ }
      return tree;
    }

    // Gather codebase context
    const sections: string[] = [];
    sections.push(`## Directory Structure\n\`\`\`\n${getTree(projectRoot)}\`\`\``);

    for (const manifest of ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml']) {
      const mp = join(projectRoot, manifest);
      if (existsSync(mp)) {
        try { sections.push(`## ${manifest}\n\`\`\`\n${readFileSync(mp, 'utf-8')}\`\`\``); } catch { /* ignore */ }
        break;
      }
    }

    for (const dir of ['src', 'app', 'lib', 'pages']) {
      const d = join(projectRoot, dir);
      if (!existsSync(d)) continue;
      try {
        let count = 0;
        for (const entry of readdirSync(d, { withFileTypes: true })) {
          if (!entry.isFile() || !/\.(ts|tsx|js|jsx|py|go|rs)$/.test(entry.name)) continue;
          if (/\.(test|spec|config)\./i.test(entry.name)) continue;
          const content = readFileSync(join(d, entry.name), 'utf-8').split('\n').slice(0, 150).join('\n');
          sections.push(`## ${dir}/${entry.name}\n\`\`\`\n${content}\`\`\``);
          if (++count >= 5) break;
        }
      } catch { /* ignore */ }
    }

    // Read existing module files for reconciliation
    const existingModules: { filename: string; content: string }[] = [];
    if (existsSync(modulesDir)) {
      try {
        for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
          if (entry.isFile() && entry.name.endsWith('.md')) {
            const content = readFileSync(join(modulesDir, entry.name), 'utf-8');
            existingModules.push({ filename: entry.name, content });
          }
        }
      } catch { /* ignore */ }
    }

    // Also check for non-module context files that describe code (architecture.md etc.)
    const contextMdFiles = ['architecture.md', 'testing.md', 'style.md', 'patterns.md'];
    for (const fname of contextMdFiles) {
      const fpath = join(contextDir, fname);
      if (existsSync(fpath)) {
        try {
          const content = readFileSync(fpath, 'utf-8');
          // Only include if it's been customized (more than just the scaffold template)
          if (content.split('\n').filter(l => l.trim() && !l.startsWith('<!--')).length > 5) {
            existingModules.push({ filename: fname, content });
          }
        } catch { /* ignore */ }
      }
    }

    let existingSection = '';
    if (existingModules.length > 0) {
      existingSection = '\n\n## EXISTING MODULE FILES (review these for accuracy)\n' +
        existingModules.map(m => `### ${m.filename}\n\`\`\`markdown\n${m.content}\n\`\`\``).join('\n\n');
    }

    const MODULES_PROMPT = `You are a codebase analyzer and documentation reconciler. You have two jobs:

1. VALIDATE existing module docs against the actual code — are they still accurate?
2. GENERATE new module docs for undocumented feature areas.

Produce ONLY valid JSON — an array of objects:
[
  {
    "filename": "auth.md",
    "action": "create" | "update" | "keep",
    "reason": "Brief explanation of why this action",
    "content": "# Auth Module\\n\\n## Key Files\\n..."
  }
]

Actions:
- "create": No existing doc for this feature area. Content = full new module doc.
- "update": Existing doc is outdated/inaccurate. Content = corrected version. Reason must explain what changed.
- "keep": Existing doc is accurate. Content = empty string "". Don't waste tokens repeating it.

Rules:
- Check every file path and export mentioned in existing docs — do they still exist in the code?
- If a file was renamed/moved, update the path
- If exports changed (renamed, removed, new ones added), update the doc
- For new modules: document Key Files, Exports, Dependencies, Notes
- Reference REAL file paths and function names from the code
- Group by feature area, not file type
- Only document what actually exists — don't invent
- content field uses \\n for newlines (valid JSON string)
- Generate 2-6 total entries (creates + updates). Skip "keep" entries to save tokens unless there are existing docs to validate.`;

    const payload = sections.join('\n\n') + existingSection;
    const stdout = await spawnWithStdin('claude', [
      '--print', '--model', 'haiku', '--system-prompt', MODULES_PROMPT,
    ], payload, 60000);

    const jsonMatch = stdout.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const results = JSON.parse(jsonMatch[0]) as { filename: string; action: string; reason?: string; content: string }[];
      await mkdir(modulesDir, { recursive: true });

      let created = 0, updated = 0, kept = 0;
      for (const mod of results) {
        if (mod.action === 'keep') { kept++; continue; }
        if (!mod.content || mod.content.trim() === '') continue;

        const fname = mod.filename.endsWith('.md') ? mod.filename : `${mod.filename}.md`;
        await writeFile(join(modulesDir, fname), mod.content, 'utf-8');
        const rp = `context/modules/${fname}`;
        if (!contextFiles.includes(rp)) contextFiles.push(rp);

        if (mod.action === 'update') {
          updated++;
          logger.dim(`  Updated ${fname}: ${mod.reason || 'content changed'}`);
        } else {
          created++;
        }
      }

      const parts = [];
      if (created > 0) parts.push(`${created} created`);
      if (updated > 0) parts.push(`${updated} updated`);
      if (kept > 0) parts.push(`${kept} verified`);
      s.stop(`Modules: ${parts.join(', ') || 'no changes needed'}`);
    } else {
      s.stop('Could not parse AI response — skipping module generation');
    }
  } catch (err) {
    logger.dim(`  Module generation skipped: ${err instanceof Error ? err.message : err}`);
  }
}

// ── Skills-based init flow ─────────────────────────────────────────────

async function initWithSkills(
  skills: string[],
  options: InitOptions,
  projectRoot: string,
  agentctxDir: string,
  contextDir: string,
  isExistingProject: boolean,
): Promise<void> {
  // Always include workflow skill
  if (!skills.includes('workflow')) {
    skills = ['workflow', ...skills];
  }

  const { resolveSkills, composeSkills } = await import('../core/skills.js');

  const s = p.spinner();
  s.start(`Resolving skills: ${skills.join(', ')}`);

  let resolved;
  try {
    resolved = await resolveSkills(skills);
  } catch (err) {
    s.stop('Failed');
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const composed = await composeSkills(resolved);
  s.stop(`Resolved ${resolved.length} skill(s)`);

  // Auto-detect project name and language
  const projectName = basename(projectRoot);
  const language = resolved.find(r => r.yaml.language)?.yaml.language ?? detectProject(projectRoot).language;

  // Create directories and write composed files
  const createSpinner = p.spinner();
  createSpinner.start('Creating .agentctx/');
  await mkdir(contextDir, { recursive: true });

  // If existing project, import existing context files first
  const importedFiles: string[] = [];
  if (isExistingProject) {
    const existingFiles = detectExistingFiles(projectRoot);
    if (existingFiles.length > 0) {
      logger.info(`Importing ${existingFiles.length} existing context file(s)`);
      for (const file of existingFiles) {
        const content = await readFile(file.path, 'utf-8');
        const sections = splitByHeadings(content);
        for (const section of sections) {
          const filename = titleToFilename(section.title);
          const filePath = join(contextDir, filename);
          await writeFile(filePath, `# ${section.title}\n\n${section.body}\n`, 'utf-8');
          const rp = `context/${filename}`;
          if (!importedFiles.includes(rp)) importedFiles.push(rp);
        }
      }
    }
  }

  const contextFiles: string[] = [];
  for (const file of composed.files) {
    const filePath = join(contextDir, file.relativePath);
    await writeFile(filePath, file.content, 'utf-8');
    contextFiles.push(`context/${file.relativePath}`);
  }

  const livingPaths = await createLivingContext(contextDir);
  contextFiles.push(...livingPaths);

  // Merge imported files (avoid duplicates with skill files)
  for (const imp of importedFiles) {
    if (!contextFiles.includes(imp)) contextFiles.push(imp);
  }

  // Write .claude/commands/ from skills
  if (composed.commands.length > 0) {
    const cmdDir = join(projectRoot, '.claude', 'commands');
    await mkdir(cmdDir, { recursive: true });
    for (const cmd of composed.commands) {
      await writeFile(join(cmdDir, cmd.relativePath), cmd.content, 'utf-8');
    }
    logger.success(`.claude/commands/ — ${composed.commands.length} workflow commands`);
  }

  // Write scaffold files from skills
  if (composed.scaffolds.length > 0) {
    for (const scaffold of composed.scaffolds) {
      const destPath = join(projectRoot, scaffold.dest);
      await mkdir(dirname(destPath), { recursive: true });
      await writeFile(destPath, scaffold.content, 'utf-8');
    }
  }

  // AI scan for module files in existing projects
  if (isExistingProject) {
    await generateAiModules(projectRoot, contextDir, contextFiles);
  }

  // Build config
  const config: Record<string, unknown> = {
    version: 1,
    project: {
      name: projectName,
      ...(language ? { language } : {}),
    },
    skills: composed.skillNames,
    context: contextFiles,
    outputs: {
      claude: { enabled: true, path: 'CLAUDE.md', max_tokens: 8000 },
      cursorrules: { enabled: true, path: '.cursorrules', max_tokens: 4000 },
    },
  };

  // If this is an app-level init, add inheritance
  if (options.app) {
    const rootAgentctx = join(process.cwd(), '.agentctx');
    if (existsSync(rootAgentctx)) {
      const relPath = relative(projectRoot, dirname(rootAgentctx));
      config.inherit = {
        from: join(relPath, '.agentctx'),
        strategy: 'merge',
      };
    }
  }

  await writeFile(join(agentctxDir, 'config.yaml'), toYaml(config, { lineWidth: 100 }), 'utf-8');
  createSpinner.stop('Created .agentctx/');

  // Generate outputs
  await generateOutputs(projectRoot, agentctxDir);

  p.outro('Done! Your context is now managed by agentctx.');

  logger.dim('\nNext steps:');
  logger.dim('  1. Review .agentctx/context/*.md and customize');
  logger.dim('  2. Run `agentctx lint` to check quality');
  logger.dim('  3. Run `agentctx generate --diff` to preview changes');

  if (options.scan) {
    console.log('');
    const { scanCommand } = await import('./scan.js');
    await scanCommand({ ai: true });
  }
}

// ── Interactive init flow ──────────────────────────────────────────────

async function initInteractive(
  options: InitOptions,
  projectRoot: string,
  agentctxDir: string,
  contextDir: string,
  isExistingProject: boolean,
): Promise<void> {
  // Detect existing context files
  const existingFiles = detectExistingFiles(projectRoot);
  const detected = detectProject(projectRoot);

  // If existing project, run codebase analysis
  let profile: CodebaseProfile | null = null;
  let suggestedSkillsList: string[] = [];

  if (isExistingProject) {
    profile = analyzeCodebase(projectRoot);
    const stack = describeStack(profile);
    if (stack !== 'Unknown') {
      p.note(`Detected: ${stack}`, 'Existing project');
    }
    suggestedSkillsList = suggestSkillNames(profile, projectRoot);
  }

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
    initialValue: profile?.language || detected.language || '',
    placeholder: 'typescript, python, go, rust...',
  });

  if (p.isCancel(language)) { p.cancel('Init cancelled.'); process.exit(0); }

  const framework = await p.text({
    message: 'Primary framework? (optional)',
    initialValue: profile?.framework || detected.framework || '',
    placeholder: 'nextjs, react, fastapi...',
  });

  if (p.isCancel(framework)) { p.cancel('Init cancelled.'); process.exit(0); }

  // NEW: Skill selection
  let selectedSkills: string[] = [];
  try {
    const { listBuiltinSkills } = await import('../core/skills.js');
    const available = await listBuiltinSkills();
    if (available.length > 0) {
      const skillSelection = await p.multiselect({
        message: 'Apply any context skills? (space to select)',
        options: available.map(s => ({ value: s.name, label: `${s.name} — ${s.description}` })),
        initialValues: suggestedSkillsList.length > 0 ? suggestedSkillsList : [],
        required: false,
      });

      if (p.isCancel(skillSelection)) { p.cancel('Init cancelled.'); process.exit(0); }
      selectedSkills = skillSelection as string[];
      if (selectedSkills.length > 0 && !selectedSkills.includes('workflow')) {
        selectedSkills = ['workflow', ...selectedSkills];
      }
    }
  } catch {
    // Skills module not available yet, skip
  }

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

  // If skills selected, compose them as starter context
  if (selectedSkills.length > 0 && contextFiles.length === 0) {
    try {
      const { resolveSkills, composeSkills } = await import('../core/skills.js');
      const resolved = await resolveSkills(selectedSkills);
      const composed = await composeSkills(resolved);
      for (const file of composed.files) {
        const filePath = join(contextDir, file.relativePath);
        await writeFile(filePath, file.content, 'utf-8');
        contextFiles.push(`context/${file.relativePath}`);
      }

      // Write .claude/commands/ from skills
      if (composed.commands.length > 0) {
        const cmdDir = join(projectRoot, '.claude', 'commands');
        await mkdir(cmdDir, { recursive: true });
        for (const cmd of composed.commands) {
          await writeFile(join(cmdDir, cmd.relativePath), cmd.content, 'utf-8');
        }
        logger.success(`.claude/commands/ — ${composed.commands.length} workflow commands`);
      }

      // Write scaffold files from skills
      if (composed.scaffolds.length > 0) {
        for (const scaffold of composed.scaffolds) {
          const destPath = join(projectRoot, scaffold.dest);
          await mkdir(dirname(destPath), { recursive: true });
          await writeFile(destPath, scaffold.content, 'utf-8');
        }
      }
    } catch (err) {
      logger.warn(`Could not apply skills: ${err instanceof Error ? err.message : err}`);
    }
  }

  // If no import and no skills, create starter files
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

  const livingPaths = await createLivingContext(contextDir);
  for (const lp of livingPaths) {
    if (!contextFiles.includes(lp)) contextFiles.push(lp);
  }

  s.stop('Created .agentctx/');

  // AI scan prompt for existing projects
  if (isExistingProject) {
    const shouldScan = await p.confirm({
      message: 'Scan codebase to auto-generate module documentation?',
      initialValue: true,
    });
    if (!p.isCancel(shouldScan) && shouldScan) {
      await generateAiModules(projectRoot, contextDir, contextFiles);
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
    ...(selectedSkills.length > 0 ? { skills: selectedSkills } : {}),
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

  // If this is an app-level init, add inheritance
  if (options.app) {
    const rootAgentctx = join(process.cwd(), '.agentctx');
    if (existsSync(rootAgentctx)) {
      const relPath = relative(projectRoot, dirname(rootAgentctx));
      config.inherit = {
        from: join(relPath, '.agentctx'),
        strategy: 'merge',
      };
    }
  }

  // Write config.yaml
  const configYaml = toYaml(config, { lineWidth: 100 });
  await writeFile(join(agentctxDir, 'config.yaml'), configYaml, 'utf-8');

  // Generate outputs
  await generateOutputs(projectRoot, agentctxDir);

  p.outro('Done! Your context is now managed by agentctx.');

  logger.dim('\nNext steps:');
  logger.dim('  1. Review .agentctx/context/*.md and customize');
  logger.dim('  2. Run `agentctx lint` to check quality');
  logger.dim('  3. Run `agentctx generate --diff` to preview changes');

  if (options.scan) {
    console.log('');
    const { scanCommand } = await import('./scan.js');
    await scanCommand({ ai: true });
  }
}

// ── Shared output generation ───────────────────────────────────────────

async function generateOutputs(projectRoot: string, agentctxDir: string): Promise<void> {
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
}

// ── Entry point ────────────────────────────────────────────────────────

export async function initCommand(skills: string[], options: InitOptions): Promise<void> {
  let projectRoot = process.cwd();

  // If --app, set up inside the app directory
  if (options.app) {
    projectRoot = resolve(process.cwd(), options.app);
    if (!existsSync(projectRoot)) {
      logger.error(`App directory not found: ${options.app}`);
      process.exit(1);
    }
  }

  const agentctxDir = join(projectRoot, '.agentctx');
  const contextDir = join(agentctxDir, 'context');

  if (existsSync(agentctxDir) && !options.force) {
    logger.error('.agentctx/ already exists. Use --force to overwrite.');
    process.exit(1);
  }

  p.intro('agentctx init');

  // Auto-detect existing project
  const isExistingProject = existsSync(join(projectRoot, 'package.json')) ||
    existsSync(join(projectRoot, 'pyproject.toml')) ||
    existsSync(join(projectRoot, 'go.mod')) ||
    existsSync(join(projectRoot, 'Cargo.toml')) ||
    existsSync(join(projectRoot, 'src')) ||
    existsSync(join(projectRoot, 'app'));

  if (skills.length > 0) {
    await initWithSkills(skills, options, projectRoot, agentctxDir, contextDir, isExistingProject);
  } else {
    await initInteractive(options, projectRoot, agentctxDir, contextDir, isExistingProject);
  }
}
