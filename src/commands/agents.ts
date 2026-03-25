import { join, dirname } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { stringify as toYaml, parse as parseYaml } from 'yaml';
import { logger } from '../utils/logger.js';
import { listAgents, listAllAgents, resolveAgent, formatAgentForContext } from '../core/agents.js';
import { findConfigPath } from '../core/config.js';
import type { AgentDefinition } from '../core/agents.js';

export async function agentsCommand(action: string, name?: string, options?: { all?: boolean }): Promise<void> {
  switch (action) {
    case 'list':
      await listAction(options?.all);
      break;
    case 'info':
      if (!name) {
        logger.error('Usage: agentctx agents info <name>');
        process.exit(1);
      }
      await infoAction(name);
      break;
    case 'add':
      if (!name) {
        logger.error('Usage: agentctx agents add <name>');
        process.exit(1);
      }
      await addAction(name);
      break;
    default:
      logger.error(`Unknown action: ${action}`);
      logger.dim('Available actions: list, info <name>, add <name>');
      process.exit(1);
  }
}

async function listAction(all: boolean = false): Promise<void> {
  const agents = all ? await listAllAgents() : await listAgents();

  if (agents.length === 0) {
    logger.warn('No agents found. Agent files may not be installed.');
    return;
  }

  console.log('');
  console.log('Available Agents (powered by Agency Agents)');
  console.log('');

  // Group by category
  const grouped = new Map<string, AgentDefinition[]>();
  for (const agent of agents) {
    const list = grouped.get(agent.category) ?? [];
    list.push(agent);
    grouped.set(agent.category, list);
  }

  for (const [category, categoryAgents] of grouped) {
    const label = category.charAt(0).toUpperCase() + category.slice(1);
    console.log(`  ${label}:`);
    for (const agent of categoryAgents) {
      const emoji = agent.frontmatter.emoji ?? '';
      const desc = agent.frontmatter.description.length > 60
        ? agent.frontmatter.description.slice(0, 57) + '...'
        : agent.frontmatter.description;
      const slugPadded = agent.slug.padEnd(24);
      console.log(`    ${slugPadded}${emoji ? emoji + '  ' : ''}${desc}`);
    }
    console.log('');
  }

  console.log('  Use: agentctx init nextjs --agent frontend-developer');
  if (!all) {
    console.log('');
    logger.dim('  Showing bundled agents. Run `agentctx agents list --all` for all 144+ from Agency Agents.');
    logger.dim('  Any agent can be used on demand — agentctx will fetch it automatically.');
  }
  console.log('   Or: agentctx agents add frontend-developer');
  console.log('');
}

async function infoAction(name: string): Promise<void> {
  let agent: AgentDefinition;
  try {
    agent = await resolveAgent(name);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log('');
  console.log(`${agent.frontmatter.emoji ?? ''} ${agent.frontmatter.name}`);
  console.log(`Category: ${agent.category}`);
  console.log(`Slug: ${agent.slug}`);
  console.log('');
  console.log(agent.frontmatter.description);
  if (agent.frontmatter.vibe) {
    console.log('');
    console.log(`Vibe: ${agent.frontmatter.vibe}`);
  }
  console.log('');
  console.log('---');
  console.log('');
  console.log(agent.content.slice(0, 500) + (agent.content.length > 500 ? '...' : ''));
  console.log('');
  console.log(`Full personality: ${agent.filePath}`);
  console.log('');
}

async function addAction(name: string): Promise<void> {
  const projectRoot = process.cwd();
  const configPath = findConfigPath(projectRoot);

  if (!configPath) {
    logger.error('No .agentctx/ found. Run `agentctx init` first.');
    process.exit(1);
  }

  let agent: AgentDefinition;
  try {
    agent = await resolveAgent(name);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const agentctxDir = dirname(configPath);
  const contextDir = join(agentctxDir, 'context');

  // Write agent content to context/agent.md
  await mkdir(contextDir, { recursive: true });
  const agentContent = formatAgentForContext(agent);
  await writeFile(join(contextDir, 'agent.md'), agentContent, 'utf-8');

  // Update config.yaml
  const rawConfig = parseYaml(await readFile(configPath, 'utf-8')) as Record<string, unknown>;
  rawConfig.agent = agent.slug;

  // Add context/agent.md to context list if not already present
  const contextFiles = (rawConfig.context ?? []) as string[];
  if (!contextFiles.includes('context/agent.md')) {
    contextFiles.push('context/agent.md');
    rawConfig.context = contextFiles;
  }

  await writeFile(configPath, toYaml(rawConfig, { lineWidth: 100 }), 'utf-8');

  logger.success(`Added agent: ${agent.frontmatter.emoji ?? ''} ${agent.frontmatter.name}`);
  logger.dim('Run `agentctx generate` to update output files.');
}
