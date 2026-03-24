import { join, resolve, dirname } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import { logger } from '../utils/logger.js';
import { spawnWithStdin } from '../utils/exec.js';
import { findConfigPath } from '../core/config.js';

const execFileAsync = promisify(execFile);

interface RefreshOptions {
  noAi?: boolean;
}

interface ModuleUpdate {
  filename: string;
  action: 'update' | 'create';
  content: string;
}

async function getRecentGitChanges(projectRoot: string): Promise<{ diffStat: string; log: string }> {
  try {
    const [diffResult, logResult] = await Promise.all([
      execFileAsync('git', ['diff', 'HEAD~5', '--stat'], { cwd: projectRoot, timeout: 10000 }),
      execFileAsync('git', ['log', '--oneline', '-5'], { cwd: projectRoot, timeout: 10000 }),
    ]);
    return {
      diffStat: diffResult.stdout,
      log: logResult.stdout,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to get git changes: ${msg}`);
  }
}

function readExistingModules(modulesDir: string): { filename: string; content: string }[] {
  const modules: { filename: string; content: string }[] = [];
  if (!existsSync(modulesDir)) return modules;

  try {
    const entries = readdirSync(modulesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      try {
        const content = readFileSync(join(modulesDir, entry.name), 'utf-8');
        modules.push({ filename: entry.name, content });
      } catch { /* ignore unreadable files */ }
    }
  } catch { /* ignore */ }

  return modules;
}

const REFRESH_SYSTEM_PROMPT = `You are a project context maintainer. Given recent git changes and existing module documentation files, determine which module files need updating or creating.

Analyze the git diff stats and commit log to understand what changed. Then look at existing module files to see what documentation exists.

Return ONLY valid JSON — an array of objects with this schema:
[
  {
    "filename": "auth.md",
    "action": "update",
    "content": "# Auth\\n\\n## Key Files\\n- \`src/auth/login.ts\` — handles login flow\\n..."
  }
]

Rules:
- action must be "update" (for existing modules that need changes) or "create" (for new modules)
- Only include modules that actually need changes based on the git diff
- Each module should document: Key Files, Exports, Dependencies, and Notes
- Use \\n for newlines in the content field (valid JSON string)
- Be specific — reference actual file paths from the diff
- If nothing needs updating, return an empty array []
- Keep modules focused and concise`;

export async function refreshCommand(options: RefreshOptions): Promise<void> {
  const configPath = findConfigPath();
  if (!configPath) {
    logger.error('No .agentctx/ found. Run `agentctx init` first.');
    process.exit(1);
  }

  const agentctxDir = dirname(configPath);
  const projectRoot = dirname(agentctxDir);
  const modulesDir = join(agentctxDir, 'context', 'modules');

  // Get recent git changes
  let gitChanges: { diffStat: string; log: string };
  try {
    gitChanges = await getRecentGitChanges(projectRoot);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (!gitChanges.diffStat.trim() && !gitChanges.log.trim()) {
    logger.info('No recent git changes found.');
    return;
  }

  // Read existing modules
  const existingModules = readExistingModules(modulesDir);

  // If --no-ai, just print what changed and suggest updates
  if (options.noAi) {
    console.log('');
    logger.info('Recent commits:');
    console.log(gitChanges.log);
    console.log('');
    logger.info('Files changed:');
    console.log(gitChanges.diffStat);

    if (existingModules.length > 0) {
      console.log('');
      logger.info(`Existing modules (${existingModules.length}):`);
      for (const mod of existingModules) {
        logger.dim(`  ${mod.filename}`);
      }
      console.log('');
      logger.dim('Review these modules and update any that relate to the changed files.');
    } else {
      console.log('');
      logger.dim('No module files found in .agentctx/context/modules/.');
      logger.dim('Consider creating module files to document key features.');
    }
    return;
  }

  // With AI: pipe git diff + existing modules to claude
  // Check claude CLI is available
  try {
    await execFileAsync('claude', ['--version'], { timeout: 5000 });
  } catch {
    logger.warn('claude CLI not found — install Claude Code to enable AI refresh');
    logger.dim('Run with --no-ai to see changes without AI analysis.');
    return;
  }

  // Build context payload
  const sections: string[] = [];
  sections.push('## Recent Commits');
  sections.push('```');
  sections.push(gitChanges.log);
  sections.push('```');
  sections.push('');
  sections.push('## Files Changed (diff stat)');
  sections.push('```');
  sections.push(gitChanges.diffStat);
  sections.push('```');

  if (existingModules.length > 0) {
    sections.push('');
    sections.push('## Existing Module Files');
    for (const mod of existingModules) {
      sections.push(`### ${mod.filename}`);
      sections.push('```markdown');
      sections.push(mod.content);
      sections.push('```');
    }
  }

  const payload = sections.join('\n');

  logger.info('Running AI analysis of recent changes...');

  try {
    const stdout = await spawnWithStdin('claude', [
      '--print',
      '--model', 'sonnet',
      '--system-prompt', REFRESH_SYSTEM_PROMPT,
    ], payload, 120000);

    // Parse JSON from response
    const jsonMatch = stdout.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn('AI returned unparseable response');
      return;
    }

    const updates = JSON.parse(jsonMatch[0]) as ModuleUpdate[];
    if (!Array.isArray(updates)) {
      logger.warn('AI returned invalid response format');
      return;
    }

    if (updates.length === 0) {
      logger.info('No module updates needed based on recent changes.');
      return;
    }

    // Validate and write updates
    const { mkdir } = await import('node:fs/promises');
    await mkdir(modulesDir, { recursive: true });

    const newFiles: string[] = [];
    for (const update of updates) {
      if (typeof update.filename !== 'string' || typeof update.content !== 'string' || typeof update.action !== 'string') {
        logger.warn(`Skipping malformed module update`);
        continue;
      }

      const filePath = join(modulesDir, update.filename);
      await writeFile(filePath, update.content, 'utf-8');
      logger.success(`${update.action === 'create' ? 'Created' : 'Updated'} modules/${update.filename}`);

      if (update.action === 'create') {
        newFiles.push(`context/modules/${update.filename}`);
      }
    }

    // Update config.yaml if new modules were created
    if (newFiles.length > 0) {
      try {
        const configContent = await readFile(configPath, 'utf-8');
        const config = parseYaml(configContent) as Record<string, unknown>;
        const existingContext = (config.context ?? []) as string[];

        for (const f of newFiles) {
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
    logger.dim('Run `agentctx generate` to update output files.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`AI analysis failed: ${msg}`);
    logger.dim('Run with --no-ai to see changes without AI analysis.');
  }
}
