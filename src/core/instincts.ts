import { z } from 'zod';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse as parseYaml, stringify as toYaml } from 'yaml';

// ── Schema ─────────────────────────────────────────────────────────────

export const InstinctSchema = z.object({
  id: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.object({
    session: z.string(),
    observation: z.string(),
  })),
  project: z.string().optional(),
  created: z.string(),
  last_seen: z.string(),
  tags: z.array(z.string()).default([]),
});

export type Instinct = z.infer<typeof InstinctSchema>;

// ── Observation ────────────────────────────────────────────────────────

export interface Observation {
  ts: string;
  tool: string;
  file: string | null;
  success: boolean;
}

// ── Read/Write ─────────────────────────────────────────────────────────

export function getInstinctsDir(projectRoot: string): string {
  return join(projectRoot, '.agentctx', 'instincts');
}

export function getObservationsPath(projectRoot: string): string {
  return join(projectRoot, '.agentctx', 'observations.jsonl');
}

export async function loadInstincts(projectRoot: string): Promise<Instinct[]> {
  const dir = getInstinctsDir(projectRoot);
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir);
  const instincts: Instinct[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) continue;
    try {
      const content = await readFile(join(dir, entry), 'utf-8');
      const raw = parseYaml(content);
      instincts.push(InstinctSchema.parse(raw));
    } catch {
      // Skip invalid instinct files
    }
  }

  return instincts;
}

export async function saveInstinct(projectRoot: string, instinct: Instinct): Promise<void> {
  const dir = getInstinctsDir(projectRoot);
  await mkdir(dir, { recursive: true });

  const filePath = join(dir, `${instinct.id}.yaml`);
  const content = toYaml(instinct, { lineWidth: 100 });
  await writeFile(filePath, content, 'utf-8');
}

export async function loadObservations(
  projectRoot: string,
  limit = 100,
): Promise<Observation[]> {
  const obsPath = getObservationsPath(projectRoot);
  if (!existsSync(obsPath)) return [];

  const content = await readFile(obsPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  // Take the most recent observations
  const recent = lines.slice(-limit);

  return recent.map(line => {
    try { return JSON.parse(line) as Observation; }
    catch { return null; }
  }).filter((o): o is Observation => o !== null);
}

// ── Confidence scoring ─────────────────────────────────────────────────

export function decayConfidence(instinct: Instinct, daysSinceLastSeen: number): number {
  // Decay 5% per week of inactivity
  const decayRate = 0.05;
  const weeks = daysSinceLastSeen / 7;
  return Math.max(0.1, instinct.confidence * Math.pow(1 - decayRate, weeks));
}

export function boostConfidence(instinct: Instinct): number {
  // Each new evidence observation boosts by 10%, capped at 0.95
  return Math.min(0.95, instinct.confidence + 0.1);
}

export function generateInstinctId(): string {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `inst-${now}-${rand}`;
}
