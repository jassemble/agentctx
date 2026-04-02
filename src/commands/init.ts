import { resolve, join, basename, extname, dirname, relative } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
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
  ai?: boolean;
  app?: string;
  agent?: string;
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
  // Create subdirectories
  await mkdir(join(contextDir, 'modules'), { recursive: true });
  await mkdir(join(contextDir, 'conventions'), { recursive: true });
  await mkdir(join(contextDir, 'agents'), { recursive: true });
  await mkdir(join(contextDir, 'references'), { recursive: true });

  // Helper: only write file if it doesn't exist or is still scaffold template
  const writeIfNew = async (filePath: string, content: string): Promise<boolean> => {
    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8');
      // Don't overwrite if user has customized it (has real content beyond placeholders)
      const realLines = existing.split('\n').filter(l => l.trim() && !l.startsWith('<!--') && !l.startsWith('#'));
      if (realLines.length > 3) return false; // User has customized — preserve
    }
    await writeFile(filePath, content, 'utf-8');
    return true;
  };

  const livingFiles: { path: string; content: string }[] = [
    {
      path: 'architecture.md',
      content: `# Architecture

## Overview
<!-- What does this project do? 2-3 sentences. -->

## Tech Stack
<!-- Key technologies and why they were chosen -->

## Directory Structure
<!-- Key directories and their purposes. Example:
- \`src/features/\` — Feature modules (auth, dashboard, billing)
- \`src/lib/\` — Shared utilities and helpers
- \`src/components/\` — Reusable UI components
-->

## Module Dependencies
<!-- How modules relate to each other. Example:
- auth → database (stores users/sessions)
- dashboard → auth (requires authentication)
- billing → auth, database (user billing records)
-->

## Data Flow
<!-- How a request/action flows through the system. Example:
Request → middleware (auth) → handler → service → database → response
-->

## Key Patterns
<!-- Patterns used throughout the codebase. Example:
- Repository pattern for data access
- Dependency injection for services
- Feature-based file organization
-->

## Conventions
<!-- Where to put new files, naming rules. Example:
- New features go in \`src/features/{name}/\`
- Components: PascalCase files, default export
- Services: camelCase, named exports
- Tests: colocated as \`{name}.test.ts\`
-->
`,
    },
    {
      path: 'decisions.md',
      content: `# Decisions

Record every non-trivial architectural decision here. Newest first.

<!-- Format:
## [YYYY-MM-DD] Decision Title
**Context:** Why this decision was needed
**Decision:** What was chosen
**Alternatives:** What else was considered and why rejected
**Consequences:** What this means going forward
-->
`,
    },
    {
      path: 'status.md',
      content: `# Status

## Last Session
<!-- Updated by AI at end of each session -->
<!-- What was accomplished, what's unfinished, user preferences -->

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
    await writeIfNew(join(contextDir, file.path), file.content);
    paths.push(`context/${file.path}`);
  }
  return paths;
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

  // Write convention files to context/conventions/
  for (const file of composed.files) {
    const filePath = join(contextDir, file.relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content, 'utf-8');
    contextFiles.push(`context/${file.relativePath}`);
  }

  // Write reference files to context/references/
  for (const file of composed.referenceFiles) {
    const filePath = join(contextDir, file.relativePath);
    await mkdir(dirname(filePath), { recursive: true });
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
    for (const cmd of composed.commands) {
      const cmdPath = join(cmdDir, cmd.relativePath);
      await mkdir(dirname(cmdPath), { recursive: true });
      await writeFile(cmdPath, cmd.content, 'utf-8');
    }
    logger.success(`.claude/commands/ — ${composed.commands.length} workflow commands`);
  }

  // Write scaffold files from skills
  if (composed.scaffolds.length > 0) {
    for (const scaffold of composed.scaffolds) {
      const destPath = join(projectRoot, scaffold.dest);
      if (!existsSync(destPath)) {
        await mkdir(dirname(destPath), { recursive: true });
        await writeFile(destPath, scaffold.content, 'utf-8');
      }
    }
  }

  // Handle --agent option (supports multiple, comma-separated)
  const agentSlugs: string[] = [];
  if (options.agent) {
    const agentNames = options.agent.split(',').map((s: string) => s.trim()).filter(Boolean);
    try {
      const { resolveAgent, formatAgentForContext } = await import('../core/agents.js');
      await mkdir(join(contextDir, 'agents'), { recursive: true });
      for (const name of agentNames) {
        try {
          const agent = await resolveAgent(name);
          const agentContent = formatAgentForContext(agent);
          const agentFilename = `${agent.slug}.md`;
          await writeFile(join(contextDir, 'agents', agentFilename), agentContent, 'utf-8');
          const agentContextPath = `context/agents/${agentFilename}`;
          if (!contextFiles.includes(agentContextPath)) {
            contextFiles.push(agentContextPath);
          }
          agentSlugs.push(agent.slug);
          logger.success(`Agent: ${agent.frontmatter.emoji ?? ''} ${agent.frontmatter.name}`);
        } catch (err) {
          logger.warn(`Could not add agent "${name}": ${err instanceof Error ? err.message : err}`);
        }
      }
    } catch (err) {
      logger.warn(`Could not load agents: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Build config
  const config: Record<string, unknown> = {
    version: 1,
    project: {
      name: projectName,
      ...(language ? { language } : {}),
    },
    ...(agentSlugs.length === 1 ? { agent: agentSlugs[0] } : {}),
    ...(agentSlugs.length > 1 ? { agents: agentSlugs } : {}),
    skills: composed.skillNames,
    context: contextFiles,
    outputs: {
      claude: { enabled: true, path: 'CLAUDE.md', max_tokens: 8000 },
      cursorrules: { enabled: true, path: '.cursor/rules/agentctx.mdc', max_tokens: 4000 },
      ...(composed.hooks.length > 0 ? { hooks: { enabled: true, path: '.agentctx/hooks/settings.json' } } : {}),
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

  logger.dim('\nComplete setup in your AI tool:\n');
  logger.dim('  Claude Code:');
  logger.dim('    Run /refresh-context to generate module docs from your codebase\n');
  logger.dim('  Cursor:');
  logger.dim('    Ask: "Read .agentctx/context/ and update architecture.md and modules/"\n');
  logger.dim('  Other tools:');
  logger.dim('    Ask your AI to read .agentctx/context/ and document your codebase\n');
  logger.dim('  Review: .agentctx/context/conventions/*.md — customize for your project');

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

  // Agent personality selection (if not passed via --agent) — two-step: divisions then agents
  if (!options.agent) {
    try {
      const { listAgents, listDivisions, getAgentsByDivision } = await import('../core/agents.js');
      const agents = await listAgents();
      if (agents.length > 0) {
        // Build recommended division pre-selections based on stack
        const detectedLang = (typeof language === 'string' ? language : '') || profile?.language || '';
        const detectedFw = (typeof framework === 'string' ? framework : '') || profile?.framework || '';
        const recommendedDivisions = new Set<string>(['engineering']);
        if (detectedFw === 'nextjs' || selectedSkills.includes('nextjs') || selectedSkills.includes('design') || selectedSkills.includes('tailwind')) {
          recommendedDivisions.add('design');
        }
        if (selectedSkills.length >= 3) {
          recommendedDivisions.add('product');
        }
        recommendedDivisions.add('testing');

        // Step 1: Pick divisions
        const divisions = listDivisions(agents);
        const divOptions = divisions
          .filter(d => d.count > 0)
          .map(d => ({
            value: d.key,
            label: `${d.emoji}  ${d.label} (${d.count})`,
            hint: recommendedDivisions.has(d.key) ? 'recommended' : undefined,
          }));

        const divSelection = await p.multiselect({
          message: 'Which agent areas interest you?',
          options: divOptions,
          initialValues: [...recommendedDivisions],
          required: false,
        });

        if (p.isCancel(divSelection)) { p.cancel('Init cancelled.'); process.exit(0); }
        const selectedDivisions = divSelection as string[];

        if (selectedDivisions.length > 0) {
          // Step 2: Pick agents from selected divisions
          const byDiv = getAgentsByDivision(agents);
          const divAgents: typeof agents = [];
          for (const divKey of selectedDivisions) {
            divAgents.push(...(byDiv.get(divKey) ?? []));
          }

          // Build smart recommendations for pre-selection
          const strongRecommendSlugs = new Set<string>();
          strongRecommendSlugs.add('senior-developer');
          strongRecommendSlugs.add('code-reviewer');
          if (detectedFw === 'nextjs' || selectedSkills.includes('nextjs')) {
            strongRecommendSlugs.add('frontend-developer');
            strongRecommendSlugs.add('backend-architect');
          }
          if (selectedSkills.includes('design')) {
            strongRecommendSlugs.add('ui-designer');
          }
          if (detectedLang === 'python' || selectedSkills.includes('python-fastapi')) {
            strongRecommendSlugs.add('backend-architect');
          }

          const agentOptions = divAgents.map(a => ({
            value: a.slug,
            label: `${a.frontmatter.emoji || ''} ${a.frontmatter.name} — ${a.frontmatter.description?.slice(0, 50)}...`,
            hint: strongRecommendSlugs.has(a.slug) ? 'recommended' : undefined,
          }));

          // Remove duplicates (in case agents appear in multiple divisions)
          const seen = new Set<string>();
          const uniqueOptions = agentOptions.filter(o => {
            if (seen.has(o.value)) return false;
            seen.add(o.value);
            return true;
          });

          const agentSelection = await p.multiselect({
            message: `Pick agents (${uniqueOptions.length} from selected areas)`,
            options: uniqueOptions,
            initialValues: [...strongRecommendSlugs].filter(s => divAgents.some(a => a.slug === s)),
            required: false,
          });

          if (p.isCancel(agentSelection)) { p.cancel('Init cancelled.'); process.exit(0); }
          const selectedAgents = agentSelection as string[];
          if (selectedAgents.length > 0) {
            options.agent = selectedAgents.join(',');
          }
        }
      }
    } catch {
      // Agents module not available, skip
    }
  }

  const outputTargets = await p.multiselect({
    message: 'Which output targets?',
    options: [
      { value: 'claude', label: 'CLAUDE.md (Claude Code)', hint: 'recommended' },
      { value: 'cursorrules', label: '.cursor/rules/agentctx.mdc (Cursor IDE)' },
      { value: 'copilot', label: '.github/copilot-instructions.md (GitHub Copilot)' },
      { value: 'gemini', label: 'GEMINI.md (Gemini CLI)' },
      { value: 'codex', label: 'AGENTS.md (Codex CLI)' },
      { value: 'windsurf', label: '.windsurfrules (Windsurf)' },
      { value: 'aider', label: 'CONVENTIONS.md (Aider)' },
      { value: 'opencode', label: '.opencode/agents/ (OpenCode)' },
      { value: 'qwen', label: '.qwen/agents/ (Qwen Code)' },
      { value: 'openclaw', label: 'OpenClaw workspace (SOUL.md + AGENTS.md)' },
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

      // Write convention files to context/conventions/
      for (const file of composed.files) {
        const filePath = join(contextDir, file.relativePath);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, file.content, 'utf-8');
        contextFiles.push(`context/${file.relativePath}`);
      }

      // Write reference files to context/references/
      for (const file of composed.referenceFiles) {
        const filePath = join(contextDir, file.relativePath);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, file.content, 'utf-8');
        contextFiles.push(`context/${file.relativePath}`);
      }

      // Write .claude/commands/ from skills
      if (composed.commands.length > 0) {
        const cmdDir = join(projectRoot, '.claude', 'commands');
        for (const cmd of composed.commands) {
          const cmdPath = join(cmdDir, cmd.relativePath);
          await mkdir(dirname(cmdPath), { recursive: true });
          await writeFile(cmdPath, cmd.content, 'utf-8');
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

  // Handle agent personalities (supports multiple, comma-separated)
  const agentSlugs: string[] = [];
  if (options.agent) {
    const agentNames = options.agent.split(',').map((s: string) => s.trim()).filter(Boolean);
    try {
      const { resolveAgent, formatAgentForContext } = await import('../core/agents.js');
      await mkdir(join(contextDir, 'agents'), { recursive: true });
      for (const name of agentNames) {
        try {
          const agent = await resolveAgent(name);
          const agentContent = formatAgentForContext(agent);
          const agentFilename = `${agent.slug}.md`;
          await writeFile(join(contextDir, 'agents', agentFilename), agentContent, 'utf-8');
          const agentContextPath = `context/agents/${agentFilename}`;
          if (!contextFiles.includes(agentContextPath)) {
            contextFiles.push(agentContextPath);
          }
          agentSlugs.push(agent.slug);
          logger.success(`Agent: ${agent.frontmatter.emoji ?? ''} ${agent.frontmatter.name}`);
        } catch (err) {
          logger.warn(`Could not add agent "${name}": ${err instanceof Error ? err.message : err}`);
        }
      }
    } catch (err) {
      logger.warn(`Could not load agents: ${err instanceof Error ? err.message : err}`);
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
    ...(agentSlugs.length === 1 ? { agent: agentSlugs[0] } : {}),
    ...(agentSlugs.length > 1 ? { agents: agentSlugs } : {}),
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
    outputs.cursorrules = { enabled: true, path: '.cursor/rules/agentctx.mdc', max_tokens: 4000 };
  }
  if (targets.includes('copilot')) {
    outputs.copilot = { enabled: true, path: '.github/copilot-instructions.md', max_tokens: 4000 };
  }
  if (targets.includes('gemini')) {
    outputs.gemini = { enabled: true, path: 'GEMINI.md', max_tokens: 8000 };
  }
  if (targets.includes('codex')) {
    outputs.codex = { enabled: true, path: 'AGENTS.md', max_tokens: 8000 };
  }
  if (targets.includes('windsurf')) {
    outputs.windsurf = { enabled: true, path: '.windsurfrules', max_tokens: 4000 };
  }
  if (targets.includes('aider')) {
    outputs.aider = { enabled: true, path: 'CONVENTIONS.md', max_tokens: 4000 };
  }
  if (targets.includes('opencode')) {
    outputs.opencode = { enabled: true, path: '.opencode/agents/agentctx.md', max_tokens: 4000 };
  }
  if (targets.includes('qwen')) {
    outputs.qwen = { enabled: true, path: '.qwen/agents/agentctx.md', max_tokens: 4000 };
  }
  if (targets.includes('openclaw')) {
    outputs.openclaw = { enabled: true, path: '.openclaw/agentctx', max_tokens: 4000 };
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

  logger.dim('\nComplete setup in your AI tool:\n');
  logger.dim('  Claude Code:');
  logger.dim('    Run /refresh-context to generate module docs from your codebase\n');
  logger.dim('  Cursor:');
  logger.dim('    Ask: "Read .agentctx/context/ and update architecture.md and modules/"\n');
  logger.dim('  Other tools:');
  logger.dim('    Ask your AI to read .agentctx/context/ and document your codebase\n');
  logger.dim('  Review: .agentctx/context/conventions/*.md — customize for your project');

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
    const { setHookEntries, getHookScripts } = await import('../generators/hooks.js');
    const { resolveSkills: resSkills, composeSkills: compSkills } = await import('../core/skills.js');

    const loadedConfig = await loadConfig(join(agentctxDir, 'config.yaml'));
    const modules = await loadContextModules(loadedConfig, agentctxDir);

    // Feed hook entries to the hooks generator
    if (loadedConfig.skills && loadedConfig.skills.length > 0 && loadedConfig.outputs.hooks?.enabled) {
      try {
        const resolvedSkills = await resSkills(loadedConfig.skills);
        const composedSkills = await compSkills(resolvedSkills);
        setHookEntries(composedSkills.hooks);
      } catch { /* hooks will be empty */ }
    }

    const results = await runGenerators(modules, loadedConfig);

    for (const result of results) {
      const outPath = resolve(projectRoot, result.path);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, result.content, 'utf-8');

      // Write hook scripts alongside hooks settings
      if (result.name === 'hooks') {
        const hookScripts = getHookScripts();
        for (const script of hookScripts) {
          const scriptPath = resolve(projectRoot, '.agentctx', script.path);
          await mkdir(dirname(scriptPath), { recursive: true });
          await writeFile(scriptPath, script.content, 'utf-8');
        }
      }
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
    logger.error('.agentctx/ already exists.');
    logger.dim('');
    logger.dim('  To add a skill or agent:    agentctx add prisma');
    logger.dim('  To regenerate outputs:      agentctx generate');
    logger.dim('  To start fresh:             agentctx init --force');
    logger.dim('');
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
