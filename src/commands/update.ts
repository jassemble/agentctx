import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import * as p from '@clack/prompts';
import { logger } from '../utils/logger.js';
import { findConfigPath, loadConfig } from '../core/config.js';
import { resolveSkill, composeSkills, resolveSkills } from '../core/skills.js';

// ── ANSI helpers ────────────────────────────────────────────────────────

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

// ── Types ───────────────────────────────────────────────────────────────

interface FileChange {
  relativePath: string;
  type: 'context' | 'command';
  oldLines: number;
  newLines: number;
  changed: boolean;
}

interface SkillUpdate {
  skillName: string;
  changes: FileChange[];
}

// ── Main command ────────────────────────────────────────────────────────

export async function updateCommand(options: { dryRun?: boolean }): Promise<void> {
  const projectRoot = process.cwd();

  // 1. Find and load config
  const configPath = findConfigPath(projectRoot);
  if (!configPath) {
    logger.error('No .agentctx/ found. Run `agentctx init` first.');
    process.exit(1);
  }

  const config = await loadConfig(configPath);
  const installedSkills = config.skills;

  if (installedSkills.length === 0) {
    logger.info('No skills installed. Nothing to update.');
    return;
  }

  console.log('');
  logger.info(`Checking updates for ${installedSkills.length} skill(s): ${installedSkills.join(', ')}`);
  console.log('');

  // 2. For each installed skill, compare installed vs built-in
  const updates: SkillUpdate[] = [];

  for (const skillName of installedSkills) {
    let resolved;
    try {
      resolved = await resolveSkill(skillName);
    } catch {
      logger.warn(`Skill "${skillName}" not found in built-in skills — skipping`);
      continue;
    }

    const changes: FileChange[] = [];

    // Compare context files (now stored in conventions/)
    for (const contextPath of resolved.yaml.context) {
      const builtinFullPath = join(resolved.dir, contextPath);
      const filename = basename(contextPath);
      const installedPath = join(projectRoot, '.agentctx', 'context', 'conventions', filename);

      if (!existsSync(builtinFullPath)) continue;

      const builtinContent = await readFile(builtinFullPath, 'utf-8');
      const builtinLines = builtinContent.split('\n').length;

      let installedContent = '';
      let installedLines = 0;
      if (existsSync(installedPath)) {
        installedContent = await readFile(installedPath, 'utf-8');
        installedLines = installedContent.split('\n').length;
      }

      const changed = builtinContent !== installedContent;
      changes.push({
        relativePath: `context/conventions/${filename}`,
        type: 'context',
        oldLines: installedLines,
        newLines: builtinLines,
        changed,
      });
    }

    // Compare command files
    for (const cmdPath of resolved.yaml.commands) {
      const builtinFullPath = join(resolved.dir, cmdPath);
      const installedPath = join(projectRoot, '.claude', 'commands', basename(cmdPath));

      if (!existsSync(builtinFullPath)) continue;

      const builtinContent = await readFile(builtinFullPath, 'utf-8');
      const builtinLines = builtinContent.split('\n').length;

      let installedContent = '';
      let installedLines = 0;
      if (existsSync(installedPath)) {
        installedContent = await readFile(installedPath, 'utf-8');
        installedLines = installedContent.split('\n').length;
      }

      const changed = builtinContent !== installedContent;
      changes.push({
        relativePath: `.claude/commands/${basename(cmdPath)}`,
        type: 'command',
        oldLines: installedLines,
        newLines: builtinLines,
        changed,
      });
    }

    const changedFiles = changes.filter(c => c.changed);
    if (changedFiles.length > 0) {
      updates.push({ skillName, changes: changedFiles });
    }
  }

  // 3. Report results
  if (updates.length === 0) {
    logger.success('All skills are up to date.');
    return;
  }

  let totalChanges = 0;
  for (const update of updates) {
    console.log(`  ${cyan(update.skillName)}:`);
    for (const change of update.changes) {
      const lineDiff = change.newLines - change.oldLines;
      const diffStr = change.oldLines === 0
        ? `(new, ${change.newLines} lines)`
        : lineDiff === 0
          ? '(modified)'
          : `(${lineDiff > 0 ? '+' : ''}${lineDiff} lines)`;
      console.log(`    ${change.changed ? '~' : ' '} ${change.relativePath} ${dim(diffStr)}`);
      totalChanges++;
    }
    console.log('');
  }

  logger.info(`${totalChanges} file(s) have updates available`);
  console.log('');

  // 4. If dry-run, stop here
  if (options.dryRun) {
    logger.dim('Dry run — no changes applied.');
    return;
  }

  // 5. Ask for confirmation
  const shouldUpdate = await p.confirm({
    message: `Apply ${totalChanges} update(s)?`,
    initialValue: true,
  });

  if (p.isCancel(shouldUpdate) || !shouldUpdate) {
    p.cancel('Update cancelled.');
    return;
  }

  // 6. Apply updates
  const s = p.spinner();
  s.start('Applying updates...');

  let applied = 0;

  for (const update of updates) {
    let resolved;
    try {
      resolved = await resolveSkill(update.skillName);
    } catch {
      continue;
    }

    for (const change of update.changes) {
      let srcPath: string;
      let destPath: string;

      if (change.type === 'context') {
        const filename = basename(change.relativePath);
        // Find the matching context entry
        const contextEntry = resolved.yaml.context.find(c => basename(c) === filename);
        if (!contextEntry) continue;
        srcPath = join(resolved.dir, contextEntry);
        destPath = join(projectRoot, '.agentctx', 'context', 'conventions', filename);
      } else {
        const filename = basename(change.relativePath);
        // Find the matching command entry
        const cmdEntry = resolved.yaml.commands.find(c => basename(c) === filename);
        if (!cmdEntry) continue;
        srcPath = join(resolved.dir, cmdEntry);
        destPath = join(projectRoot, '.claude', 'commands', filename);
      }

      try {
        const content = await readFile(srcPath, 'utf-8');
        // Ensure directory exists
        const destDir = join(destPath, '..');
        await mkdir(destDir, { recursive: true });
        await writeFile(destPath, content, 'utf-8');
        applied++;
      } catch (err) {
        logger.warn(`Could not update ${change.relativePath}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  s.stop(`Applied ${applied} update(s)`);

  // 7. Regenerate outputs suggestion
  console.log('');
  logger.dim('Run `agentctx generate` to regenerate outputs with updated context.');
}
