import { join, relative } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { logger } from '../utils/logger.js';
import { computeSourceHash } from '../core/module-assembler.js';

// ── Types ──────────────────────────────────────────────────────────────

interface ModuleStatus {
  modulePath: string;
  status: 'fresh' | 'stale' | 'unenriched';
}

interface SyncStatusReport {
  total: number;
  fresh: number;
  stale: number;
  unenriched: number;
  needsEnrichment: string[];
}

interface SyncStatusOptions {
  json?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────

function walkModuleFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  function walk(current: string): void {
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(join(current, entry.name));
      } else if (entry.name.endsWith('.md')) {
        results.push(join(current, entry.name));
      }
    }
  }

  walk(dir);
  return results;
}

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    return parseYaml(match[1]) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function classifyModule(
  filePath: string,
  modulesDir: string,
  projectRoot: string,
): ModuleStatus | null {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const fm = parseFrontmatter(content);

  // Skip non-scan-generated files (e.g. code-map.md, manually created context)
  if (fm['generated-by'] !== 'agentctx-scan') return null;

  const sourceFiles = fm['source-files'];
  if (!Array.isArray(sourceFiles) || sourceFiles.length === 0) return null;

  const storedHash = fm['source-hash'] as string | undefined;
  const enrichedHash = fm['enriched-hash'] as string | undefined;

  // Module path from file path: /path/modules/app/auth.md → app/auth
  const rel = relative(modulesDir, filePath);
  const modulePath = rel.replace(/\.md$/, '');

  // Recompute current hash from source file mtimes
  const currentHash = computeSourceHash(projectRoot, sourceFiles as string[]);

  if (!enrichedHash) {
    return { modulePath, status: 'unenriched' };
  }

  if (enrichedHash === currentHash) {
    return { modulePath, status: 'fresh' };
  }

  return { modulePath, status: 'stale' };
}

// ── Main command ───────────────────────────────────────────────────────

export async function syncStatusCommand(options: SyncStatusOptions): Promise<void> {
  const projectRoot = process.cwd();
  const agentctxDir = join(projectRoot, '.agentctx');
  const modulesDir = join(agentctxDir, 'context', 'modules');

  if (!existsSync(modulesDir)) {
    if (options.json) {
      console.log(JSON.stringify({ total: 0, fresh: 0, stale: 0, unenriched: 0, needsEnrichment: [] }));
    } else {
      logger.warn('No modules found. Run `agentctx scan` first.');
    }
    return;
  }

  const moduleFiles = walkModuleFiles(modulesDir);
  const statuses: ModuleStatus[] = [];

  for (const file of moduleFiles) {
    const status = classifyModule(file, modulesDir, projectRoot);
    if (status) statuses.push(status);
  }

  const report: SyncStatusReport = {
    total: statuses.length,
    fresh: statuses.filter(s => s.status === 'fresh').length,
    stale: statuses.filter(s => s.status === 'stale').length,
    unenriched: statuses.filter(s => s.status === 'unenriched').length,
    needsEnrichment: statuses
      .filter(s => s.status === 'stale' || s.status === 'unenriched')
      .map(s => s.modulePath),
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Human-readable output
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

  console.log('');
  console.log(`  Module enrichment status (${report.total} total):`);
  console.log(`    ${green('Fresh:')}       ${report.fresh} ${dim('(enriched + source unchanged)')}`);
  console.log(`    ${yellow('Stale:')}       ${report.stale} ${dim('(enriched but source changed)')}`);
  console.log(`    ${cyan('Unenriched:')}  ${report.unenriched} ${dim('(never enriched)')}`);
  console.log('');

  if (report.needsEnrichment.length > 0) {
    console.log(`  Needs enrichment (${report.needsEnrichment.length}):`);
    for (const mod of report.needsEnrichment) {
      const status = statuses.find(s => s.modulePath === mod)!;
      const tag = status.status === 'stale' ? yellow('[stale]') : cyan('[new]');
      console.log(`    ${tag} ${mod}`);
    }
    console.log('');
    logger.dim('Run /agentctx-sync to enrich these modules.');
  } else {
    logger.success('All modules are fresh — no enrichment needed.');
  }
}
