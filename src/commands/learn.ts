import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { logger } from '../utils/logger.js';
import { spawnWithStdin } from '../utils/exec.js';
import {
  loadObservations,
  loadInstincts,
  saveInstinct,
  generateInstinctId,
  boostConfidence,
  type Instinct,
  type Observation,
} from '../core/instincts.js';

interface LearnOptions {
  dryRun?: boolean;
}

const LEARN_SYSTEM_PROMPT = `You are a pattern analyzer. Given a list of tool usage observations from an AI coding session, extract atomic behavioral patterns ("instincts") that could improve future sessions.

Each instinct is a single, specific, actionable rule learned from the observations. NOT generic advice — specific to what actually happened.

Output ONLY valid JSON — an array of objects:
[
  {
    "description": "Always use server components for data fetching in Next.js app/ routes",
    "evidence": "User corrected client-side fetch to server component 3 times",
    "tags": ["nextjs", "data-fetching"],
    "confidence": 0.7
  }
]

Rules:
- Extract 1-5 instincts per analysis (only real patterns, not noise)
- Confidence 0.3-0.5 for single-occurrence patterns, 0.6-0.8 for repeated patterns
- Tags should be specific skill/domain keywords
- Description must be actionable: "Always X when Y" or "Never X because Y"
- Skip generic patterns like "write clean code" — only project-specific learnings
- If no meaningful patterns exist, return an empty array []`;

export async function learnCommand(options: LearnOptions): Promise<void> {
  const projectRoot = process.cwd();
  const agentctxDir = join(projectRoot, '.agentctx');

  if (!existsSync(agentctxDir)) {
    logger.warn('No .agentctx/ found. Run `agentctx init` first.');
    return;
  }

  // Load recent observations
  const observations = await loadObservations(projectRoot, 200);
  if (observations.length === 0) {
    logger.warn('No observations found. Use the workflow skill with hooks enabled to capture tool usage.');
    return;
  }

  logger.info(`Analyzing ${observations.length} observations...`);

  // Load existing instincts for deduplication
  const existing = await loadInstincts(projectRoot);

  // Build analysis payload
  const payload = buildPayload(observations, existing);

  // Send to Claude for analysis
  let extracted: Array<{
    description: string;
    evidence: string;
    tags: string[];
    confidence: number;
  }>;

  try {
    const stdout = await spawnWithStdin('claude', [
      '--print',
      '--model', 'haiku',
      '--system-prompt', LEARN_SYSTEM_PROMPT,
    ], payload, 60000);

    const jsonMatch = stdout.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn('AI analysis returned no patterns');
      return;
    }

    extracted = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(extracted) || extracted.length === 0) {
      logger.info('No new patterns detected in recent observations.');
      return;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`AI analysis failed: ${msg}`);
    logger.dim('Ensure claude CLI is installed (Claude Code).');
    return;
  }

  // Process extracted instincts
  const today = new Date().toISOString().split('T')[0];
  let created = 0;
  let updated = 0;

  for (const item of extracted) {
    // Check for existing similar instinct
    const match = existing.find(i =>
      i.description.toLowerCase().includes(item.description.toLowerCase().slice(0, 30)) ||
      item.description.toLowerCase().includes(i.description.toLowerCase().slice(0, 30))
    );

    if (match) {
      // Boost existing instinct
      match.confidence = boostConfidence(match);
      match.last_seen = today;
      match.evidence.push({
        session: today,
        observation: item.evidence,
      });

      if (!options.dryRun) {
        await saveInstinct(projectRoot, match);
      }
      updated++;
      logger.dim(`  ↑ Boosted: ${match.description} (${(match.confidence * 100).toFixed(0)}%)`);
    } else {
      // Create new instinct
      const instinct: Instinct = {
        id: generateInstinctId(),
        description: item.description,
        confidence: Math.max(0.3, Math.min(0.9, item.confidence)),
        evidence: [{
          session: today,
          observation: item.evidence,
        }],
        created: today,
        last_seen: today,
        tags: item.tags || [],
      };

      if (!options.dryRun) {
        await saveInstinct(projectRoot, instinct);
      }
      created++;
      logger.success(`  + New: ${instinct.description} (${(instinct.confidence * 100).toFixed(0)}%)`);
    }
  }

  console.log('');
  if (options.dryRun) {
    logger.dim(`Dry run: would create ${created} new, update ${updated} existing instincts.`);
  } else {
    logger.success(`Extracted ${created} new instincts, updated ${updated} existing.`);
    logger.dim('Run `agentctx evolve` to promote proven instincts into conventions.');
  }
}

function buildPayload(observations: Observation[], existing: Instinct[]): string {
  const sections: string[] = [];

  // Summarize observations
  sections.push('## Recent Tool Usage Observations');
  sections.push('');

  // Group by tool
  const byTool = new Map<string, Observation[]>();
  for (const obs of observations) {
    const list = byTool.get(obs.tool) || [];
    list.push(obs);
    byTool.set(obs.tool, list);
  }

  for (const [tool, obs] of byTool) {
    const files = [...new Set(obs.filter(o => o.file).map(o => o.file!))];
    const failures = obs.filter(o => !o.success).length;
    sections.push(`### ${tool} (${obs.length} calls, ${failures} failures)`);
    if (files.length > 0) {
      sections.push(`Files: ${files.slice(0, 10).join(', ')}`);
    }
    sections.push('');
  }

  // Show existing instincts to avoid duplicates
  if (existing.length > 0) {
    sections.push('## Existing Instincts (do NOT duplicate these)');
    for (const inst of existing) {
      sections.push(`- ${inst.description} (confidence: ${inst.confidence})`);
    }
    sections.push('');
  }

  return sections.join('\n');
}
