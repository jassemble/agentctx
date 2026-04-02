import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { logger } from '../utils/logger.js';
import {
  loadInstincts,
  decayConfidence,
  saveInstinct,
} from '../core/instincts.js';

interface EvolveOptions {
  threshold?: number;
  dryRun?: boolean;
}

export async function evolveCommand(options: EvolveOptions): Promise<void> {
  const projectRoot = process.cwd();
  const agentctxDir = join(projectRoot, '.agentctx');

  if (!existsSync(agentctxDir)) {
    logger.warn('No .agentctx/ found. Run `agentctx init` first.');
    return;
  }

  const instincts = await loadInstincts(projectRoot);
  if (instincts.length === 0) {
    logger.warn('No instincts found. Run `agentctx learn` first to extract patterns.');
    return;
  }

  const threshold = options.threshold ?? 0.7;
  const today = new Date();

  // Apply confidence decay
  for (const inst of instincts) {
    const lastSeen = new Date(inst.last_seen);
    const daysSince = Math.floor((today.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince > 7) {
      inst.confidence = decayConfidence(inst, daysSince);
      await saveInstinct(projectRoot, inst);
    }
  }

  // Group instincts by tag
  const byTag = new Map<string, typeof instincts>();
  for (const inst of instincts) {
    for (const tag of inst.tags) {
      const list = byTag.get(tag) || [];
      list.push(inst);
      byTag.set(tag, list);
    }
  }

  // Find promotable clusters (high-confidence instincts with same tag)
  const promotable = instincts.filter(i => i.confidence >= threshold);
  const stale = instincts.filter(i => i.confidence < 0.2);

  console.log('');
  logger.info(`Instinct report: ${instincts.length} total`);
  console.log('');

  // Show high-confidence instincts ready for promotion
  if (promotable.length > 0) {
    console.log(`  Ready to promote (confidence ≥ ${(threshold * 100).toFixed(0)}%):`);
    for (const inst of promotable) {
      console.log(`    ✓ ${inst.description} (${(inst.confidence * 100).toFixed(0)}%, seen ${inst.evidence.length}x)`);
    }
    console.log('');
  }

  // Show active instincts
  const active = instincts.filter(i => i.confidence >= 0.3 && i.confidence < threshold);
  if (active.length > 0) {
    console.log(`  Active (building confidence):`);
    for (const inst of active) {
      console.log(`    ○ ${inst.description} (${(inst.confidence * 100).toFixed(0)}%)`);
    }
    console.log('');
  }

  // Show stale instincts
  if (stale.length > 0) {
    console.log(`  Stale (confidence < 20% — consider removing):`);
    for (const inst of stale) {
      console.log(`    ✗ ${inst.description} (${(inst.confidence * 100).toFixed(0)}%)`);
    }
    console.log('');
  }

  // Promote high-confidence instincts to conventions
  if (promotable.length > 0 && !options.dryRun) {
    const conventionsPath = join(agentctxDir, 'context', 'modules', 'learned-patterns.md');

    let existing = '';
    try { existing = await readFile(conventionsPath, 'utf-8'); }
    catch { /* may not exist */ }

    const lines = [
      '# Learned Patterns',
      '',
      '> Auto-evolved from instincts by `agentctx evolve`. High-confidence patterns extracted from your sessions.',
      '',
      '## Key Files',
    ];

    // Extract unique files from instinct evidence
    const files = new Set<string>();
    for (const inst of promotable) {
      for (const ev of inst.evidence) {
        if (ev.observation.includes('/')) {
          const match = ev.observation.match(/\b(src\/[^\s,]+|lib\/[^\s,]+|app\/[^\s,]+)/);
          if (match) files.add(match[1]);
        }
      }
    }
    for (const f of [...files].slice(0, 5)) {
      lines.push(`- \`${f}\``);
    }

    lines.push('');
    lines.push('## Patterns');
    lines.push('');

    // Group by tag for organized output
    for (const [tag, tagInstincts] of byTag) {
      const promoted = tagInstincts.filter(i => i.confidence >= threshold);
      if (promoted.length === 0) continue;

      lines.push(`### ${tag}`);
      for (const inst of promoted) {
        lines.push(`- ${inst.description}`);
      }
      lines.push('');
    }

    // Also add untagged promotable instincts
    const untagged = promotable.filter(i => i.tags.length === 0);
    if (untagged.length > 0) {
      lines.push('### General');
      for (const inst of untagged) {
        lines.push(`- ${inst.description}`);
      }
      lines.push('');
    }

    lines.push('## Exports');
    for (const inst of promotable.slice(0, 10)) {
      lines.push(`- ${inst.description}`);
    }
    lines.push('');

    await writeFile(conventionsPath, lines.join('\n'), 'utf-8');
    logger.success(`Promoted ${promotable.length} instincts to learned-patterns.md`);
    logger.dim('Run `agentctx generate` to include in CLAUDE.md output.');
  }

  console.log('');
}
