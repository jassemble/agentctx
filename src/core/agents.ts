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

/**
 * Find the directory containing bundled agent .md files.
 * Checks two locations:
 *   1. Bundled: {package-root}/agents/
 *   2. Local dev: agency-agents sibling directory
 */
export function getAgentSourceDir(): string {
  // In dev (tsx): src/core/agents.ts -> ../../agents
  const devPath = join(dirname(__filename), '..', '..', 'agents');
  if (existsSync(devPath)) return devPath;

  // After build (tsup): dist/index.js -> ../agents
  const distPath = join(dirname(__filename), '..', 'agents');
  if (existsSync(distPath)) return distPath;

  return devPath; // fallback — will fail later with clear error
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
 * Scan the agent source directory and return all parsed agents, sorted by category then slug.
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

  // Sort by category, then by slug
  agents.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.slug.localeCompare(b.slug);
  });

  return agents;
}

/**
 * Find an agent by slug. Tries exact match first, then partial match.
 * Throws a clear error with suggestions if not found.
 */
export async function resolveAgent(name: string): Promise<AgentDefinition> {
  const agents = await listAgents();

  // 1. Exact slug match
  const exact = agents.find(a => a.slug === name);
  if (exact) return exact;

  // 2. Partial match (slug contains the search term)
  const partials = agents.filter(a => a.slug.includes(name));
  if (partials.length === 1) return partials[0];

  // 3. Try matching against the full filename pattern (category-slug)
  const fullMatch = agents.find(a => `${a.category}-${a.slug}` === name);
  if (fullMatch) return fullMatch;

  // Build helpful error message
  const suggestions = partials.length > 0
    ? partials.map(a => a.slug)
    : agents
        .map(a => ({ slug: a.slug, distance: levenshteinDistance(name, a.slug) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3)
        .map(a => a.slug);

  const hint = suggestions.length > 0
    ? `\n\nDid you mean one of these?\n${suggestions.map(s => `  - ${s}`).join('\n')}`
    : `\n\nRun \`agentctx agents list\` to see available agents.`;

  throw new Error(`Agent "${name}" not found.${hint}`);
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
