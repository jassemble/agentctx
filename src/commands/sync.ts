import { join, basename, dirname, resolve } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import * as p from '@clack/prompts';
import { logger } from '../utils/logger.js';
import { spawnWithStdin } from '../utils/exec.js';
import { findConfigPath, loadConfig } from '../core/config.js';
import { resolveSkills, composeSkills } from '../core/skills.js';

const execFileAsync = promisify(execFile);

interface SyncOptions {
  add?: string[];
  agent?: string;
  ai?: boolean;
}

// ── Step 1: Validate modules against codebase ─────────────────────────

const VALIDATE_PROMPT = `You are a codebase documentation validator. Given a project's current source code and existing module documentation files, check if the docs are still accurate.

For each existing module, verify:
- Do the referenced file paths still exist?
- Are the listed exports still correct?
- Are dependencies still accurate?
- Is anything new that should be documented?

Also identify undocumented feature areas that should have module files.

Return ONLY valid JSON:
[
  {
    "filename": "auth.md",
    "action": "update" | "create" | "keep",
    "reason": "Brief explanation",
    "content": "# Auth Module\\n\\n## Key Files\\n..."
  }
]

Actions:
- "update": Doc is outdated. Content = corrected version. Reason = what's wrong.
- "create": New undocumented area. Content = full module doc.
- "keep": Doc is accurate. Content = "".

Rules:
- Check EVERY file path and export in existing docs against actual code
- Reference real file paths and function names
- Each module: Key Files, Exports, Dependencies, Notes
- Use \\n for newlines (valid JSON string)
- Be concise but thorough`;

async function validateModules(
  projectRoot: string,
  modulesDir: string,
  contextFiles: string[],
): Promise<{ created: number; updated: number; kept: number }> {
  // Check claude CLI
  try {
    await execFileAsync('claude', ['--version'], { timeout: 5000 });
  } catch {
    logger.dim('  claude CLI not found — skipping AI validation');
    return { created: 0, updated: 0, kept: 0 };
  }

  const s = p.spinner();
  s.start('Validating modules against codebase...');

  // Gather codebase context
  const IGNORE = new Set(['node_modules', '.git', '.next', '__pycache__', 'dist', '.agentctx', '.turbo', '.cache', 'coverage']);
  function getTree(root: string, depth = 0, max = 2): string {
    if (depth > max) return '';
    let t = '';
    try {
      for (const e of readdirSync(root, { withFileTypes: true })) {
        if (IGNORE.has(e.name)) continue;
        const indent = '  '.repeat(depth);
        if (e.isDirectory()) { t += `${indent}${e.name}/\n`; t += getTree(join(root, e.name), depth + 1, max); }
        else if (depth <= 1) t += `${indent}${e.name}\n`;
      }
    } catch {}
    return t;
  }

  const sections: string[] = [];
  sections.push(`## Directory Structure\n\`\`\`\n${getTree(projectRoot)}\`\`\``);

  // Package manifest
  for (const manifest of ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml']) {
    const mp = join(projectRoot, manifest);
    if (existsSync(mp)) {
      try { sections.push(`## ${manifest}\n\`\`\`\n${readFileSync(mp, 'utf-8')}\`\`\``); } catch {}
      break;
    }
  }

  // Source files
  for (const dir of ['src', 'app', 'lib', 'pages']) {
    const d = join(projectRoot, dir);
    if (!existsSync(d)) continue;
    try {
      let count = 0;
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (!e.isFile() || !/\.(ts|tsx|js|jsx|py|go|rs)$/.test(e.name)) continue;
        if (/\.(test|spec|config)\./i.test(e.name)) continue;
        const content = readFileSync(join(d, e.name), 'utf-8').split('\n').slice(0, 150).join('\n');
        sections.push(`## ${dir}/${e.name}\n\`\`\`\n${content}\`\`\``);
        if (++count >= 5) break;
      }
    } catch {}
  }

  // Existing modules
  const existingModules: { filename: string; content: string }[] = [];
  if (existsSync(modulesDir)) {
    try {
      for (const e of readdirSync(modulesDir, { withFileTypes: true })) {
        if (e.isFile() && e.name.endsWith('.md')) {
          existingModules.push({ filename: e.name, content: readFileSync(join(modulesDir, e.name), 'utf-8') });
        }
      }
    } catch {}
  }

  if (existingModules.length > 0) {
    sections.push('\n## EXISTING MODULE FILES (validate these)');
    for (const m of existingModules) {
      sections.push(`### ${m.filename}\n\`\`\`markdown\n${m.content}\n\`\`\``);
    }
  }

  try {
    const stdout = await spawnWithStdin('claude', [
      '--print', '--model', 'haiku', '--system-prompt', VALIDATE_PROMPT,
    ], sections.join('\n\n'), 60000);

    const jsonMatch = stdout.match(/\[[\s\S]*\]/);
    if (!jsonMatch) { s.stop('Could not parse AI response'); return { created: 0, updated: 0, kept: 0 }; }

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
        logger.dim(`  Created ${fname}`);
      }
    }

    const parts = [];
    if (created > 0) parts.push(`${created} created`);
    if (updated > 0) parts.push(`${updated} updated`);
    if (kept > 0) parts.push(`${kept} verified`);
    s.stop(`Modules: ${parts.join(', ') || 'no changes needed'}`);

    return { created, updated, kept };
  } catch (err) {
    s.stop('AI validation failed');
    logger.dim(`  ${err instanceof Error ? err.message : err}`);
    return { created: 0, updated: 0, kept: 0 };
  }
}

// ── Step 2: Add new skills ────────────────────────────────────────────

async function addSkills(
  skillNames: string[],
  projectRoot: string,
  config: Record<string, unknown>,
): Promise<void> {
  const existingSkills = (config.skills ?? []) as string[];
  const newSkills = skillNames.filter(s => !existingSkills.includes(s));

  if (newSkills.length === 0) {
    logger.info('Skills already installed.');
    return;
  }

  const s = p.spinner();
  s.start(`Adding skill(s): ${newSkills.join(', ')}`);

  const resolved = await resolveSkills(newSkills);
  const composed = await composeSkills(resolved);

  const contextDir = join(projectRoot, '.agentctx', 'context');
  const existingContext = (config.context ?? []) as string[];

  // Write convention files to context/conventions/
  for (const file of composed.files) {
    const filePath = join(contextDir, file.relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content, 'utf-8');
    const rp = `context/${file.relativePath}`;
    if (!existingContext.includes(rp)) existingContext.push(rp);
  }

  // Write reference files to context/references/
  for (const file of composed.referenceFiles) {
    const filePath = join(contextDir, file.relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content, 'utf-8');
    const rp = `context/${file.relativePath}`;
    if (!existingContext.includes(rp)) existingContext.push(rp);
  }

  // Write commands
  if (composed.commands.length > 0) {
    const cmdDir = join(projectRoot, '.claude', 'commands');
    await mkdir(cmdDir, { recursive: true });
    for (const cmd of composed.commands) {
      await writeFile(join(cmdDir, cmd.relativePath), cmd.content, 'utf-8');
    }
  }

  // Write scaffolds
  for (const scaffold of composed.scaffolds) {
    const destPath = join(projectRoot, scaffold.dest);
    if (!existsSync(destPath)) {
      await mkdir(dirname(destPath), { recursive: true });
      await writeFile(destPath, scaffold.content, 'utf-8');
    }
  }

  // Update config
  config.skills = [...existingSkills, ...newSkills];
  config.context = existingContext;

  s.stop(`Added ${newSkills.length} skill(s)`);
}

// ── Step 4: Regenerate outputs ────────────────────────────────────────

async function regenerateOutputs(projectRoot: string, agentctxDir: string): Promise<void> {
  const s = p.spinner();
  s.start('Regenerating outputs...');

  try {
    const { resolveInheritance } = await import('../core/inheritance.js');
    const { runGenerators } = await import('../generators/index.js');

    const configPath = join(agentctxDir, 'config.yaml');
    const resolved = await resolveInheritance(configPath);
    const results = await runGenerators(resolved.modules, resolved.config);

    for (const result of results) {
      await writeFile(resolve(projectRoot, result.path), result.content, 'utf-8');
    }

    s.stop('Regenerated outputs');
    for (const result of results) {
      const budgetStr = result.tokenBudget
        ? ` (${Math.round((result.tokenCount / result.tokenBudget) * 100)}% of ${result.tokenBudget.toLocaleString()})`
        : '';
      logger.success(`${result.path}  ${result.tokenCount.toLocaleString()} tokens${budgetStr}`);
    }
  } catch (err) {
    s.stop('Output generation failed');
    logger.warn(`${err instanceof Error ? err.message : err}`);
  }
}

// ── Main command ──────────────────────────────────────────────────────

export async function syncCommand(options: SyncOptions): Promise<void> {
  const projectRoot = process.cwd();
  const configPath = findConfigPath(projectRoot);

  if (!configPath) {
    logger.error('No .agentctx/ found. Run `agentctx init` first.');
    process.exit(1);
  }

  const agentctxDir = dirname(configPath);
  const modulesDir = join(agentctxDir, 'context', 'modules');

  p.intro('agentctx sync');

  // Load config as raw object (we'll modify and write back)
  const rawConfig = parseYaml(await readFile(configPath, 'utf-8')) as Record<string, unknown>;
  const contextFiles = (rawConfig.context ?? []) as string[];

  // Step 1: Add new skills (if --add)
  if (options.add && options.add.length > 0) {
    await addSkills(options.add, projectRoot, rawConfig);
  }

  // Step 1b: Add agent (if --agent)
  if (options.agent) {
    try {
      const { resolveAgent, formatAgentForContext } = await import('../core/agents.js');
      const agent = await resolveAgent(options.agent);
      const contextDir = join(agentctxDir, 'context');
      const agentsDir = join(contextDir, 'agents');
      await mkdir(agentsDir, { recursive: true });
      const agentContent = formatAgentForContext(agent);
      const agentFilename = `${agent.slug}.md`;
      await writeFile(join(agentsDir, agentFilename), agentContent, 'utf-8');
      rawConfig.agent = agent.slug;
      const agentContextPath = `context/agents/${agentFilename}`;
      if (!contextFiles.includes(agentContextPath)) {
        contextFiles.push(agentContextPath);
      }
      logger.success(`Agent: ${agent.frontmatter.emoji ?? ''} ${agent.frontmatter.name}`);
    } catch (err) {
      logger.warn(`Could not add agent: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Step 2: Validate modules against codebase (AI — opt-in)
  if (options.ai) {
    logger.info('Running AI validation (using claude CLI)...');
    await validateModules(projectRoot, modulesDir, contextFiles);
  }

  // Step 3: Write updated config
  rawConfig.context = contextFiles;
  await writeFile(configPath, toYaml(rawConfig, { lineWidth: 100 }), 'utf-8');

  // Step 4: Regenerate outputs
  await regenerateOutputs(projectRoot, agentctxDir);

  p.outro('Sync complete.');
}
