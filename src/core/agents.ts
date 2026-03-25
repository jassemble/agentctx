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
  slug: string;         // e.g., "frontend-developer"
  category: string;     // e.g., "engineering"
  frontmatter: AgentFrontmatter;
  content: string;      // Full markdown content (without frontmatter)
  filePath: string;     // Where it came from
}

const AGENCY_AGENTS_REPO = 'https://raw.githubusercontent.com/msitarzewski/agency-agents/main';
const AGENCY_AGENTS_CATEGORIES = ['engineering', 'design', 'marketing', 'product', 'testing', 'support', 'sales', 'specialized', 'game-dev', 'academic', 'spatial-computing', 'project-management'];

/**
 * Find the directory containing bundled agent .md files.
 */
export function getAgentSourceDir(): string {
  const devPath = join(dirname(__filename), '..', '..', 'agents');
  if (existsSync(devPath)) return devPath;

  const distPath = join(dirname(__filename), '..', 'agents');
  if (existsSync(distPath)) return distPath;

  return devPath;
}

/**
 * Find the full agency-agents repo if it's cloned locally (sibling directory).
 */
function getFullAgencyDir(): string | null {
  // Check common locations
  const candidates = [
    join(dirname(__filename), '..', '..', '..', 'agency-agents'),  // sibling in dev
    join(dirname(__filename), '..', '..', 'agency-agents'),        // sibling after build
    join(process.cwd(), '..', 'agency-agents'),                     // sibling of project
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate) && existsSync(join(candidate, 'engineering'))) {
      return candidate;
    }
  }
  return null;
}

/**
 * Fetch a single agent file from GitHub.
 */
async function fetchAgentFromGithub(category: string, filename: string): Promise<string | null> {
  const url = `${AGENCY_AGENTS_REPO}/${category}/${filename}`;
  try {
    const response = await fetch(url);
    if (response.ok) return await response.text();
  } catch { /* network error */ }
  return null;
}

/**
 * Parse a single .md agent file with YAML frontmatter.
 */
export async function parseAgentFile(filePath: string): Promise<AgentDefinition> {
  const raw = await readFile(filePath, 'utf-8');
  const filename = basename(filePath, extname(filePath));

  // Split on --- to extract frontmatter
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error(`Agent file missing YAML frontmatter: ${filePath}`);
  }

  const yamlStr = fmMatch[1];
  const content = fmMatch[2].trim();

  // Parse YAML frontmatter (allow extra fields like 'tools')
  const parsed = parseYaml(yamlStr);
  const frontmatter = AgentFrontmatterSchema.parse(parsed);

  // Extract category and slug from filename
  // e.g., "engineering-frontend-developer" -> category "engineering", slug "frontend-developer"
  // e.g., "product-manager" -> category "product", slug "manager"
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

  return {
    slug,
    category,
    frontmatter,
    content,
    filePath,
  };
}

/**
 * Scan bundled agents. Returns the curated set shipped with agentctx.
 */
export async function listAgents(): Promise<AgentDefinition[]> {
  const agentsDir = getAgentSourceDir();
  if (!existsSync(agentsDir)) return [];

  const entries = await readdir(agentsDir, { withFileTypes: true });
  const agents: AgentDefinition[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    try {
      const agent = await parseAgentFile(join(agentsDir, entry.name));
      agents.push(agent);
    } catch {
      // Skip invalid agent files
    }
  }

  agents.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.slug.localeCompare(b.slug);
  });

  return agents;
}

/**
 * List ALL agents — scans the full agency-agents repo if cloned locally.
 */
export async function listAllAgents(): Promise<AgentDefinition[]> {
  const fullDir = getFullAgencyDir();
  if (!fullDir) return listAgents(); // fallback to bundled

  const agents: AgentDefinition[] = [];

  for (const category of AGENCY_AGENTS_CATEGORIES) {
    const catDir = join(fullDir, category);
    if (!existsSync(catDir)) continue;

    try {
      const entries = await readdir(catDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        try {
          const agent = await parseAgentFile(join(catDir, entry.name));
          agents.push(agent);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  agents.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.slug.localeCompare(b.slug);
  });

  return agents;
}

/**
 * Find an agent by slug. Search order:
 *   1. Bundled agents
 *   2. Full agency-agents repo (if cloned locally)
 *   3. Fetch from GitHub (on demand)
 */
export async function resolveAgent(name: string): Promise<AgentDefinition> {
  // 1. Search bundled agents
  const bundled = await listAgents();
  const fromBundled = findAgent(bundled, name);
  if (fromBundled) return fromBundled;

  // 2. Search full repo if available locally
  const fullDir = getFullAgencyDir();
  if (fullDir) {
    const allAgents = await listAllAgents();
    const fromFull = findAgent(allAgents, name);
    if (fromFull) return fromFull;
  }

  // 3. Try fetching from GitHub
  const fetched = await fetchAgentByName(name);
  if (fetched) return fetched;

  // Build helpful error
  const allKnown = fullDir ? await listAllAgents() : bundled;
  const suggestions = allKnown
    .map(a => ({ slug: a.slug, distance: levenshteinDistance(name, a.slug) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map(a => a.slug);

  const hint = suggestions.length > 0
    ? `\n\nDid you mean one of these?\n${suggestions.map(s => `  - ${s}`).join('\n')}`
    : '';

  throw new Error(`Agent "${name}" not found.${hint}\n\nRun \`agentctx agents list --all\` to see all available agents.`);
}

function findAgent(agents: AgentDefinition[], name: string): AgentDefinition | null {
  // Exact slug match
  const exact = agents.find(a => a.slug === name);
  if (exact) return exact;

  // Full filename pattern (category-slug)
  const fullMatch = agents.find(a => `${a.category}-${a.slug}` === name);
  if (fullMatch) return fullMatch;

  // Single partial match
  const partials = agents.filter(a => a.slug.includes(name));
  if (partials.length === 1) return partials[0];

  return null;
}

/**
 * Try to fetch a specific agent from GitHub by trying common category prefixes.
 */
async function fetchAgentByName(name: string): Promise<AgentDefinition | null> {
  for (const category of AGENCY_AGENTS_CATEGORIES) {
    const filename = `${category}-${name}.md`;
    const content = await fetchAgentFromGithub(category, filename);
    if (content) {
      // Write to a temp location and parse
      const { tmpdir } = await import('node:os');
      const { writeFile: writeTmp } = await import('node:fs/promises');
      const tmpPath = join(tmpdir(), `agentctx-agent-${filename}`);
      await writeTmp(tmpPath, content, 'utf-8');
      try {
        return await parseAgentFile(tmpPath);
      } catch { /* parse failed */ }
    }
  }
  return null;
}

/**
 * Format an agent definition for storage in context/agent.md.
 * The content is stored as-is from the agent file; the CLAUDE.md generator
 * handles special rendering with attribution.
 */
export function formatAgentForContext(agent: AgentDefinition): string {
  return agent.content;
}

// Simple Levenshtein distance for fuzzy matching
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
