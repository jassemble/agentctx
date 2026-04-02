import { join, dirname } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { stringify as toYaml, parse as parseYaml } from 'yaml';
import * as p from '@clack/prompts';
import { logger } from '../utils/logger.js';
import { listAgents, resolveAgent, formatAgentForContext, listDivisions, getAgentsByDivision, DIVISION_MAP } from '../core/agents.js';
import { findConfigPath } from '../core/config.js';
import type { AgentDefinition } from '../core/agents.js';

export async function agentsCommand(action: string, name?: string, options?: Record<string, unknown>): Promise<void> {
  switch (action) {
    case 'list':
      await listAction(name, options);
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
        await interactiveAddAction();
      } else {
        await addAction(name);
      }
      break;
    default:
      // Treat unknown action as a division name for `agentctx agents engineering`
      const agents = await listAgents();
      if (DIVISION_MAP[action]) {
        showDivisionAgents(action, agents);
        return;
      }
      logger.error(`Unknown action: ${action}`);
      logger.dim('Available actions: list, info <name>, add <name>');
      process.exit(1);
  }
}

async function listAction(division?: string, options?: Record<string, unknown>): Promise<void> {
  const agents = await listAgents();

  if (agents.length === 0) {
    logger.warn('No agents found. Agent files may not be installed.');
    return;
  }

  // `--all` flag: show the full flat list (backward compat)
  if (options?.all) {
    showAllAgents(agents);
    return;
  }

  // Division drill-down: `agentctx agents list engineering`
  if (division) {
    if (!DIVISION_MAP[division]) {
      logger.error(`Unknown division: "${division}"`);
      console.log('');
      console.log('Available divisions:');
      for (const [key, info] of Object.entries(DIVISION_MAP)) {
        console.log(`  ${key.padEnd(14)} ${info.emoji}  ${info.label}`);
      }
      console.log('');
      process.exit(1);
    }
    showDivisionAgents(division, agents);
    return;
  }

  // Default: show division overview
  showDivisionOverview(agents);
}

function showDivisionOverview(agents: AgentDefinition[]): void {
  const divisions = listDivisions(agents);

  console.log('');
  console.log(`Available Agent Divisions (${agents.length} agents)`);
  console.log('');

  for (const div of divisions) {
    if (div.count === 0) continue;
    const keyPadded = div.key.padEnd(14);
    const countStr = `(${div.count})`.padEnd(6);
    console.log(`  ${div.emoji}  ${keyPadded} ${countStr} ${div.description}`);
  }

  console.log('');
  console.log('  Usage:');
  console.log('    agentctx agents list <division>    Browse agents in a division');
  console.log('    agentctx agents list --all         Show all agents');
  console.log('    agentctx agents info <name>        Agent details');
  console.log('    agentctx agents add <name>         Add to project');
  logger.dim(`\n  Powered by Agency Agents (github.com/msitarzewski/agency-agents)`);
  console.log('');
}

function showDivisionAgents(divisionKey: string, agents: AgentDefinition[]): void {
  const info = DIVISION_MAP[divisionKey];
  const byDiv = getAgentsByDivision(agents);
  const divAgents = byDiv.get(divisionKey) ?? [];

  console.log('');
  console.log(`${info.emoji}  ${info.label} (${divAgents.length} agents)`);
  console.log('');

  for (const agent of divAgents) {
    const emoji = agent.frontmatter.emoji ?? '';
    const desc = agent.frontmatter.description.length > 60
      ? agent.frontmatter.description.slice(0, 57) + '...'
      : agent.frontmatter.description;
    const slugPadded = agent.slug.padEnd(32);
    console.log(`  ${slugPadded}${emoji ? emoji + '  ' : ''}${desc}`);
  }

  console.log('');
  console.log('  Use: agentctx agents add <slug>');
  console.log('  Info: agentctx agents info <slug>');
  console.log('');
}

function showAllAgents(agents: AgentDefinition[]): void {
  console.log('');
  console.log('All Available Agents (powered by Agency Agents)');
  console.log('');

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
  console.log('   Or: agentctx agents add frontend-developer');
  logger.dim(`\n  ${agents.length} agents bundled from Agency Agents (github.com/msitarzewski/agency-agents)`);
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

async function interactiveAddAction(): Promise<void> {
  const configPath = findConfigPath(process.cwd());
  if (!configPath) {
    logger.error('No .agentctx/ found. Run `agentctx init` first.');
    process.exit(1);
  }

  const agents = await listAgents();
  if (agents.length === 0) {
    logger.warn('No agents found.');
    return;
  }

  // Step 1: Multi-select divisions
  const divisions = listDivisions(agents);
  const divChoice = await p.multiselect({
    message: 'Which agent areas interest you?',
    options: divisions
      .filter(d => d.count > 0)
      .map(d => ({
        value: d.key,
        label: `${d.emoji}  ${d.label} (${d.count})`,
        hint: d.description,
      })),
    required: true,
  });

  if (p.isCancel(divChoice)) { p.cancel('Cancelled.'); process.exit(0); }
  const selectedDivisions = divChoice as string[];

  // Step 2: Per-division agent picker
  const byDiv = getAgentsByDivision(agents);
  const allSelected: string[] = [];

  for (const divKey of selectedDivisions) {
    const info = DIVISION_MAP[divKey];
    const divAgents = byDiv.get(divKey) ?? [];

    const agentChoice = await p.multiselect({
      message: `Pick agents from ${info.emoji}  ${info.label}`,
      options: divAgents.map(a => ({
        value: a.slug,
        label: `${a.frontmatter.emoji || ''} ${a.frontmatter.name}`,
        hint: a.frontmatter.description.slice(0, 60),
      })),
      required: false,
    });

    if (p.isCancel(agentChoice)) { p.cancel('Cancelled.'); process.exit(0); }
    allSelected.push(...(agentChoice as string[]));
  }

  if (allSelected.length === 0) {
    logger.warn('No agents selected.');
    return;
  }

  // Add all selected agents in batch
  await addAgents(allSelected);
}

async function addAction(name: string): Promise<void> {
  await addAgents([name]);
}

async function addAgents(names: string[]): Promise<void> {
  const projectRoot = process.cwd();
  const configPath = findConfigPath(projectRoot);

  if (!configPath) {
    logger.error('No .agentctx/ found. Run `agentctx init` first.');
    process.exit(1);
  }

  const agentctxDir = dirname(configPath);
  const agentsDir = join(agentctxDir, 'context', 'agents');
  await mkdir(agentsDir, { recursive: true });

  const rawConfig = parseYaml(await readFile(configPath, 'utf-8')) as Record<string, unknown>;
  const contextFiles = (rawConfig.context ?? []) as string[];

  // Collect existing agent slugs from config
  const existingSlugs: string[] = [];
  if (Array.isArray(rawConfig.agents)) {
    existingSlugs.push(...rawConfig.agents as string[]);
  } else if (typeof rawConfig.agent === 'string') {
    existingSlugs.push(rawConfig.agent);
  }

  const added: string[] = [];

  for (const name of names) {
    let agent: AgentDefinition;
    try {
      agent = await resolveAgent(name);
    } catch (err) {
      logger.warn(`Could not add "${name}": ${err instanceof Error ? err.message : err}`);
      continue;
    }

    // Write to context/agents/{slug}.md
    const agentFilename = `${agent.slug}.md`;
    const agentContent = formatAgentForContext(agent);
    await writeFile(join(agentsDir, agentFilename), agentContent, 'utf-8');

    // Add to context list
    const contextPath = `context/agents/${agentFilename}`;
    if (!contextFiles.includes(contextPath)) {
      contextFiles.push(contextPath);
    }

    if (!existingSlugs.includes(agent.slug)) {
      existingSlugs.push(agent.slug);
    }

    added.push(`${agent.frontmatter.emoji ?? ''} ${agent.frontmatter.name}`);
  }

  if (added.length === 0) return;

  // Update config
  rawConfig.context = contextFiles;
  // Clean up old single-agent field
  delete rawConfig.agent;
  rawConfig.agents = existingSlugs;

  await writeFile(configPath, toYaml(rawConfig, { lineWidth: 100 }), 'utf-8');

  // Summary output
  console.log('');
  logger.success(`Added ${added.length} agent${added.length > 1 ? 's' : ''}:`);
  for (const label of added) {
    console.log(`  ${label}`);
  }
  console.log('');
  logger.dim('Run `agentctx generate` to update output files.');
}
