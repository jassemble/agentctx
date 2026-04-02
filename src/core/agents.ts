import { z } from 'zod';
import { readFile, readdir } from 'node:fs/promises';
import { join, basename, extname, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

// Agent frontmatter schema (from agency-agents format)
export const AgentFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  color: z.string().optional(),
  emoji: z.string().optional(),
  vibe: z.string().optional(),
});

export type AgentFrontmatter = z.infer<typeof AgentFrontmatterSchema>;

export interface AgentDefinition {
  slug: string;
  category: string;
  frontmatter: AgentFrontmatter;
  content: string;
  filePath: string;
}

/**
 * Find the directory containing bundled agent .md files.
 * All 156 agents from Agency Agents are bundled with agentctx.
 */
export function getAgentSourceDir(): string {
  const devPath = join(dirname(__filename), '..', '..', 'agents');
  if (existsSync(devPath)) return devPath;

  const distPath = join(dirname(__filename), '..', 'agents');
  if (existsSync(distPath)) return distPath;

  return devPath;
}

/**
 * Parse a single .md agent file with YAML frontmatter.
 */
export async function parseAgentFile(filePath: string): Promise<AgentDefinition> {
  const raw = await readFile(filePath, 'utf-8');
  const filename = basename(filePath, extname(filePath));

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error(`Agent file missing YAML frontmatter: ${filePath}`);
  }

  const parsed = parseYaml(fmMatch[1]);
  const frontmatter = AgentFrontmatterSchema.parse(parsed);
  const content = fmMatch[2].trim();

  const firstDash = filename.indexOf('-');
  let category: string;
  let slug: string;

  if (firstDash > 0) {
    category = filename.slice(0, firstDash);
    slug = filename.slice(firstDash + 1);
  } else {
    category = 'general';
    slug = filename;
  }

  return { slug, category, frontmatter, content, filePath };
}

/**
 * List all bundled agents (156 from Agency Agents).
 */
export async function listAgents(): Promise<AgentDefinition[]> {
  const agentsDir = getAgentSourceDir();
  if (!existsSync(agentsDir)) return [];

  const entries = await readdir(agentsDir, { withFileTypes: true });
  const agents: AgentDefinition[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    try {
      agents.push(await parseAgentFile(join(agentsDir, entry.name)));
    } catch { /* skip invalid */ }
  }

  agents.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.slug.localeCompare(b.slug);
  });

  return agents;
}

// Alias for backward compat
export const listAllAgents = listAgents;

/**
 * Find an agent by slug. All 156 agents are bundled — no network needed.
 */
export async function resolveAgent(name: string): Promise<AgentDefinition> {
  const agents = await listAgents();

  // Exact slug match
  const exact = agents.find(a => a.slug === name);
  if (exact) return exact;

  // Full filename pattern (category-slug)
  const fullMatch = agents.find(a => `${a.category}-${a.slug}` === name);
  if (fullMatch) return fullMatch;

  // Single partial match
  const partials = agents.filter(a => a.slug.includes(name));
  if (partials.length === 1) return partials[0];

  // Fuzzy suggestions
  const suggestions = agents
    .map(a => ({ slug: a.slug, distance: levenshteinDistance(name, a.slug) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map(a => a.slug);

  const hint = suggestions.length > 0
    ? `\n\nDid you mean one of these?\n${suggestions.map(s => `  - ${s}`).join('\n')}`
    : '';

  throw new Error(`Agent "${name}" not found.${hint}\n\nRun \`agentctx agents list\` to see all available agents.`);
}

/**
 * Format an agent definition for storage in context/agents/.
 */
export function formatAgentForContext(agent: AgentDefinition): string {
  return agent.content;
}

// ── Division mapping ─────────────────────────────────────────────────

export interface DivisionInfo {
  label: string;
  emoji: string;
  description: string;
  categories: string[];
}

export const DIVISION_MAP: Record<string, DivisionInfo> = {
  engineering:   { label: 'Engineering',        emoji: '⚙️',  description: 'Backend, frontend, DevOps, security, AI/ML',          categories: ['engineering', 'lsp', 'terminal', 'automation', 'agentic', 'agents'] },
  design:        { label: 'Design & Creative',  emoji: '🎨', description: 'UI/UX, brand, visual storytelling',                   categories: ['design', 'blender', 'narrative', 'technical'] },
  marketing:     { label: 'Marketing',          emoji: '📣', description: 'Content, SEO, social media, growth',                  categories: ['marketing'] },
  sales:         { label: 'Sales & Business',   emoji: '💼', description: 'Sales, accounts, recruiting, supply chain',           categories: ['sales', 'accounts', 'recruitment', 'supply', 'corporate', 'report'] },
  product:       { label: 'Product & Project',  emoji: '🧭', description: 'Product management, sprints, feedback',               categories: ['product', 'project'] },
  testing:       { label: 'Testing & Quality',  emoji: '🧪', description: 'QA, accessibility, performance, compliance',          categories: ['testing', 'compliance'] },
  gamedev:       { label: 'Game Development',   emoji: '🎮', description: 'Unity, Unreal, Godot, Roblox, game design',           categories: ['game', 'unity', 'unreal', 'godot', 'roblox', 'level'] },
  xr:            { label: 'XR & Spatial',       emoji: '🥽', description: 'VR/AR, visionOS, spatial computing',                  categories: ['xr', 'visionos', 'macos'] },
  'paid-media':  { label: 'Paid Media',         emoji: '💰', description: 'PPC, programmatic, social ads, tracking',             categories: ['paid'] },
  specialized:   { label: 'Specialized',        emoji: '🔮', description: 'Academic, healthcare, government, blockchain, support', categories: ['specialized', 'academic', 'blockchain', 'data', 'government', 'healthcare', 'identity', 'study', 'support', 'zk'] },
};

const categoryToDivision = new Map<string, string>();
for (const [divKey, info] of Object.entries(DIVISION_MAP)) {
  for (const cat of info.categories) {
    categoryToDivision.set(cat, divKey);
  }
}

export function getDivisionForCategory(category: string): string {
  return categoryToDivision.get(category) ?? 'specialized';
}

export function getAgentsByDivision(agents: AgentDefinition[]): Map<string, AgentDefinition[]> {
  const grouped = new Map<string, AgentDefinition[]>();
  for (const divKey of Object.keys(DIVISION_MAP)) {
    grouped.set(divKey, []);
  }
  for (const agent of agents) {
    const div = getDivisionForCategory(agent.category);
    const list = grouped.get(div) ?? [];
    list.push(agent);
    grouped.set(div, list);
  }
  return grouped;
}

export function listDivisions(agents: AgentDefinition[]): Array<{ key: string; label: string; emoji: string; description: string; count: number }> {
  const byDiv = getAgentsByDivision(agents);
  return Object.entries(DIVISION_MAP).map(([key, info]) => ({
    key,
    label: info.label,
    emoji: info.emoji,
    description: info.description,
    count: byDiv.get(key)?.length ?? 0,
  }));
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
