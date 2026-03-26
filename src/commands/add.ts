import { join, dirname, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parse as parseYaml, stringify as toYaml } from 'yaml';
import { logger } from '../utils/logger.js';
import { findConfigPath } from '../core/config.js';

export async function addCommand(items: string[]): Promise<void> {
  if (items.length === 0) {
    logger.error('Usage: agentctx add <skill|agent> [more...]');
    logger.dim('  Skills: nextjs, tailwind, typescript, python-fastapi, design');
    logger.dim('  Agents: frontend-developer, backend-architect, code-reviewer, ...');
    logger.dim('');
    logger.dim('  Run `agentctx agents list` to see all available agents');
    process.exit(1);
  }

  const configPath = findConfigPath();
  if (!configPath) {
    logger.error('No .agentctx/ found. Run `agentctx init` first.');
    process.exit(1);
  }

  const agentctxDir = dirname(configPath);
  const projectRoot = dirname(agentctxDir);
  const contextDir = join(agentctxDir, 'context');

  // Load config
  const rawConfig = parseYaml(await readFile(configPath, 'utf-8')) as Record<string, unknown>;
  const contextFiles = (rawConfig.context ?? []) as string[];
  const existingSkills = (rawConfig.skills ?? []) as string[];

  let changed = false;

  for (const item of items) {
    // Try as skill first
    const addedAsSkill = await tryAddSkill(item, projectRoot, contextDir, contextFiles, existingSkills, rawConfig);
    if (addedAsSkill) {
      changed = true;
      continue;
    }

    // Try as agent
    const addedAsAgent = await tryAddAgent(item, contextDir, contextFiles, rawConfig);
    if (addedAsAgent) {
      changed = true;
      continue;
    }

    logger.warn(`"${item}" is not a known skill or agent. Run \`agentctx agents list\` to see agents.`);
  }

  if (changed) {
    // Write updated config
    rawConfig.context = contextFiles;
    await writeFile(configPath, toYaml(rawConfig, { lineWidth: 100 }), 'utf-8');

    // Regenerate outputs
    try {
      const { resolveInheritance } = await import('../core/inheritance.js');
      const { runGenerators } = await import('../generators/index.js');
      const { resolve } = await import('node:path');

      const resolved = await resolveInheritance(configPath);
      const results = await runGenerators(resolved.modules, resolved.config);

      for (const result of results) {
        await writeFile(resolve(projectRoot, result.path), result.content, 'utf-8');
      }

      for (const result of results) {
        const budgetStr = result.tokenBudget
          ? ` (${Math.round((result.tokenCount / result.tokenBudget) * 100)}% of ${result.tokenBudget.toLocaleString()})`
          : '';
        logger.success(`${result.path}  ${result.tokenCount.toLocaleString()} tokens${budgetStr}`);
      }
    } catch (err) {
      logger.warn(`Could not regenerate outputs: ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function tryAddSkill(
  name: string,
  projectRoot: string,
  contextDir: string,
  contextFiles: string[],
  existingSkills: string[],
  rawConfig: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { resolveSkill, composeSkills } = await import('../core/skills.js');
    const resolved = await resolveSkill(name);

    if (existingSkills.includes(name)) {
      logger.dim(`  Skill "${name}" already installed`);
      return true;
    }

    const composed = await composeSkills([resolved]);

    // Write convention files
    for (const file of composed.files) {
      const filePath = join(contextDir, file.relativePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, file.content, 'utf-8');
      const rp = `context/${file.relativePath}`;
      if (!contextFiles.includes(rp)) contextFiles.push(rp);
    }

    // Write reference files
    for (const file of composed.referenceFiles) {
      const filePath = join(contextDir, file.relativePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, file.content, 'utf-8');
      const rp = `context/${file.relativePath}`;
      if (!contextFiles.includes(rp)) contextFiles.push(rp);
    }

    // Write commands
    if (composed.commands.length > 0) {
      const cmdDir = join(projectRoot, '.claude', 'commands');
      await mkdir(cmdDir, { recursive: true });
      for (const cmd of composed.commands) {
        await writeFile(join(cmdDir, cmd.relativePath), cmd.content, 'utf-8');
      }
    }

    // Write scaffolds (only if they don't exist)
    for (const scaffold of composed.scaffolds) {
      const destPath = join(projectRoot, scaffold.dest);
      if (!existsSync(destPath)) {
        await mkdir(dirname(destPath), { recursive: true });
        await writeFile(destPath, scaffold.content, 'utf-8');
      }
    }

    existingSkills.push(name);
    rawConfig.skills = existingSkills;
    logger.success(`Added skill: ${name}`);
    return true;
  } catch {
    return false; // Not a valid skill — try as agent
  }
}

async function tryAddAgent(
  name: string,
  contextDir: string,
  contextFiles: string[],
  rawConfig: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { resolveAgent, formatAgentForContext } = await import('../core/agents.js');
    const agent = await resolveAgent(name);
    const agentsDir = join(contextDir, 'agents');
    await mkdir(agentsDir, { recursive: true });

    const agentContent = formatAgentForContext(agent);
    const agentFilename = `${agent.slug}.md`;
    await writeFile(join(agentsDir, agentFilename), agentContent, 'utf-8');

    const agentContextPath = `context/agents/${agentFilename}`;
    if (!contextFiles.includes(agentContextPath)) {
      contextFiles.push(agentContextPath);
    }

    // Support single or multiple agents in config
    const existingAgent = rawConfig.agent as string | undefined;
    const existingAgents = (rawConfig.agents ?? []) as string[];

    if (existingAgent && existingAgent !== agent.slug) {
      // Convert single to array
      rawConfig.agents = [existingAgent, agent.slug];
      delete rawConfig.agent;
    } else if (existingAgents.length > 0) {
      if (!existingAgents.includes(agent.slug)) {
        existingAgents.push(agent.slug);
      }
    } else {
      rawConfig.agent = agent.slug;
    }

    logger.success(`Added agent: ${agent.frontmatter.emoji ?? ''} ${agent.frontmatter.name}`);
    return true;
  } catch {
    return false; // Not a valid agent either
  }
}
