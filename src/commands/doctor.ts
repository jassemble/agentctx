import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../utils/logger.js';
import { findConfigPath, loadConfig } from '../core/config.js';
import { listBuiltinSkills } from '../core/skills.js';
import { analyzeCodebase, describeStack, suggestSkillNames } from '../core/detector.js';
import type { AgentCtxConfig } from '../core/config.js';

const execFileAsync = promisify(execFile);

// ── ANSI helpers ────────────────────────────────────────────────────────

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

// ── Interfaces ──────────────────────────────────────────────────────────

interface Recommendation {
  type: 'ok' | 'warn';
  message: string;
  hint?: string;
}

// ── Main command ────────────────────────────────────────────────────────

export async function doctorCommand(): Promise<void> {
  const projectRoot = process.cwd();

  console.log('');
  console.log(bold('  agentctx doctor'));
  console.log('');

  // 1. Find and load config
  const configPath = findConfigPath(projectRoot);
  let config: AgentCtxConfig | null = null;
  if (configPath) {
    try {
      config = await loadConfig(configPath);
    } catch {
      logger.warn('Found config but could not parse it');
    }
  }

  // 2. Run codebase detection
  const profile = analyzeCodebase(projectRoot);
  const stackDesc = describeStack(profile);

  // 3. Determine installed vs suggested skills
  const installedSkills = config?.skills ?? [];
  const suggestedSkills = suggestSkillNames(profile, projectRoot);
  const builtinSkills = await listBuiltinSkills();

  console.log(`  ${dim('Stack:')}   ${cyan(stackDesc)}`);
  console.log(`  ${dim('Skills:')}  ${cyan(installedSkills.length > 0 ? installedSkills.join(', ') : 'none')}`);
  console.log('');

  const recommendations: Recommendation[] = [];
  let score = 0;

  // ── Check: Skills match detected stack ────────────────────────────────

  if (!config) {
    recommendations.push({
      type: 'warn',
      message: 'No .agentctx/ found',
      hint: `Run: agentctx init ${suggestedSkills.join(' ')}`,
    });
  } else {
    // Check if installed skills cover the suggested ones
    const missingSuggested = suggestedSkills.filter(s => !installedSkills.includes(s));
    if (missingSuggested.length === 0 && installedSkills.length > 0) {
      recommendations.push({ type: 'ok', message: 'Skills match your stack' });
      score += 2;
    } else if (missingSuggested.length > 0) {
      recommendations.push({
        type: 'warn',
        message: `Missing skills for your stack: ${missingSuggested.join(', ')}`,
        hint: `Run: agentctx init --force ${[...installedSkills, ...missingSuggested].join(' ')}`,
      });
    } else {
      score += 1; // partial credit
    }
  }

  // ── Check: ORM context ────────────────────────────────────────────────

  if (profile.orm) {
    const dbModulePath = join(projectRoot, '.agentctx', 'context', 'modules', 'database.md');
    if (existsSync(dbModulePath)) {
      score += 1;
    } else {
      recommendations.push({
        type: 'warn',
        message: `You use ${profile.orm} but have no database context documented`,
        hint: 'Add a .agentctx/context/modules/database.md',
      });
    }
  }

  // ── Check: modules/ has files ─────────────────────────────────────────

  const modulesDir = join(projectRoot, '.agentctx', 'context', 'modules');
  let moduleCount = 0;
  let lastModuleUpdate: Date | null = null;

  if (existsSync(modulesDir)) {
    try {
      const entries = await readdir(modulesDir);
      const mdFiles = entries.filter(e => e.endsWith('.md'));
      moduleCount = mdFiles.length;

      // Find most recent module update
      for (const file of mdFiles) {
        const fileStat = await stat(join(modulesDir, file));
        if (!lastModuleUpdate || fileStat.mtime > lastModuleUpdate) {
          lastModuleUpdate = fileStat.mtime;
        }
      }
    } catch { /* ignore */ }
  }

  if (moduleCount > 0) {
    recommendations.push({
      type: 'ok',
      message: `${moduleCount} module(s) documented in .agentctx/context/modules/`,
    });
    score += 2;
  } else if (config) {
    recommendations.push({
      type: 'warn',
      message: 'modules/ is empty — AI cannot discover existing code',
      hint: 'Run: /agentctx-sync or agentctx generate',
    });
  }

  // ── Check: architecture.md customized ─────────────────────────────────

  const archPath = join(projectRoot, '.agentctx', 'context', 'architecture.md');
  if (existsSync(archPath)) {
    try {
      const archContent = await readFile(archPath, 'utf-8');
      // Check if it's still the scaffold (mostly comment placeholders)
      const nonCommentLines = archContent.split('\n').filter(
        line => line.trim().length > 0 && !line.trim().startsWith('<!--') && !line.trim().startsWith('#')
      );
      if (nonCommentLines.length > 3) {
        recommendations.push({ type: 'ok', message: 'architecture.md is customized' });
        score += 1;
      } else {
        recommendations.push({
          type: 'warn',
          message: 'architecture.md is still a scaffold',
          hint: 'Customize it with your project structure and conventions',
        });
      }
    } catch { /* ignore */ }
  }

  // ── Check: decisions.md populated ─────────────────────────────────────

  const decisionsPath = join(projectRoot, '.agentctx', 'context', 'decisions.md');
  if (existsSync(decisionsPath)) {
    try {
      const decisionsContent = await readFile(decisionsPath, 'utf-8');
      const nonCommentLines = decisionsContent.split('\n').filter(
        line => line.trim().length > 0 && !line.trim().startsWith('<!--') && !line.trim().startsWith('#')
      );
      if (nonCommentLines.length > 0) {
        recommendations.push({ type: 'ok', message: 'decisions.md has entries' });
        score += 1;
      } else {
        recommendations.push({
          type: 'warn',
          message: 'decisions.md is empty',
          hint: 'Document key decisions as you make them',
        });
      }
    } catch { /* ignore */ }
  }

  // ── Check: Recently refreshed ─────────────────────────────────────────

  if (lastModuleUpdate) {
    const daysSince = Math.floor((Date.now() - lastModuleUpdate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince < 7) {
      recommendations.push({ type: 'ok', message: `Context refreshed ${daysSince === 0 ? 'today' : daysSince + ' day(s) ago'}` });
      score += 1;
    } else {
      recommendations.push({
        type: 'warn',
        message: `Context last refreshed ${daysSince} days ago`,
        hint: 'Run: /agentctx-sync or agentctx generate',
      });
    }
  }

  // ── Check: Specs ──────────────────────────────────────────────────────

  const indexPath = join(projectRoot, 'specs', 'INDEX.md');
  let hasSpecs = false;
  let staleSpecs: string[] = [];

  if (existsSync(indexPath)) {
    try {
      const indexContent = await readFile(indexPath, 'utf-8');
      const lines = indexContent.split('\n');
      const specLines = lines.filter(line => /\|\s*(draft|approved|in-progress|completed)\s*\|/i.test(line));
      hasSpecs = specLines.length > 0;

      if (hasSpecs) {
        recommendations.push({ type: 'ok', message: `${specLines.length} spec(s) tracked in INDEX.md` });
        score += 1;
      }

      // Check for stale in-progress specs
      const inProgressLines = specLines.filter(line => /in-progress/i.test(line));
      for (const line of inProgressLines) {
        // Try to extract spec file reference
        const fileMatch = line.match(/\[.*?\]\((.*?)\)/);
        if (fileMatch) {
          const specFile = join(projectRoot, 'specs', fileMatch[1]);
          if (existsSync(specFile)) {
            try {
              const specStat = await stat(specFile);
              const daysSince = Math.floor((Date.now() - specStat.mtime.getTime()) / (1000 * 60 * 60 * 24));
              if (daysSince > 7) {
                staleSpecs.push(`${fileMatch[1]} (${daysSince} days)`);
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch { /* ignore */ }
  }

  if (!hasSpecs && config) {
    recommendations.push({
      type: 'warn',
      message: 'No specs tracked',
      hint: 'Create a spec with: /spec',
    });
  }

  // ── Check: Stale specs ────────────────────────────────────────────────

  if (staleSpecs.length === 0 && hasSpecs) {
    recommendations.push({ type: 'ok', message: 'No stale in-progress specs' });
    score += 1;
  } else {
    for (const stale of staleSpecs) {
      recommendations.push({
        type: 'warn',
        message: `Spec ${stale} has been in-progress too long`,
        hint: `Review with: /review specs/${stale.split(' ')[0]}`,
      });
    }
  }

  // ── Check: Checkpoints ────────────────────────────────────────────────

  let hasCheckpoints = false;
  try {
    const { stdout } = await execFileAsync('git', ['tag', '-l', 'cp-*', '--sort=-creatordate'], {
      cwd: projectRoot,
      timeout: 5000,
    });
    const tags = stdout.trim().split('\n').filter(Boolean);
    if (tags.length > 0) {
      hasCheckpoints = true;
      recommendations.push({ type: 'ok', message: `${tags.length} checkpoint(s) exist` });
      score += 1;
    }
  } catch {
    // Not a git repo or no tags
  }

  if (!hasCheckpoints && config) {
    recommendations.push({
      type: 'warn',
      message: 'No checkpoints found',
      hint: 'Create one with: /checkpoint',
    });
  }

  // ── Check: Skill version differences ──────────────────────────────────

  if (config && installedSkills.length > 0) {
    for (const skillName of installedSkills) {
      const builtin = builtinSkills.find(s => s.name === skillName);
      if (!builtin) continue;

      // We just check version strings from built-in vs config
      // (config doesn't store versions, so we note if builtin exists)
    }
  }

  // ── Print recommendations ─────────────────────────────────────────────

  for (const rec of recommendations) {
    if (rec.type === 'ok') {
      console.log(`  ${green('\u2713')} ${rec.message}`);
    } else {
      console.log(`  ${yellow('\u26A0')} ${rec.message}`);
      if (rec.hint) {
        console.log(`    ${dim('\u2192 ' + rec.hint)}`);
      }
    }
  }

  // ── Print health score ────────────────────────────────────────────────

  // Cap at 10
  const finalScore = Math.min(score, 10);
  console.log('');
  const scoreColor = finalScore >= 8 ? green : finalScore >= 5 ? yellow : yellow;
  console.log(`  ${dim('Health:')} ${scoreColor(`${finalScore}/10`)}`);
  console.log('');
}
