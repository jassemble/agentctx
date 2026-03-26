import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, readdir, stat, rename, writeFile, mkdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join, basename, extname, relative } from 'node:path';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { logger } from '../utils/logger.js';
import { estimateTokens } from '../utils/tokens.js';

const execFileAsync = promisify(execFile);

interface DashboardOptions {
  port: string;
  open?: boolean;
}

// ── SSE live reload ────────────────────────────────────────────────────

const sseClients = new Set<ServerResponse>();

function broadcastReload(changedFile: string): void {
  const data = `data: ${JSON.stringify({ type: 'reload', file: changedFile })}\n\n`;
  for (const client of sseClients) {
    client.write(data);
  }
}

function setupFileWatcher(projectRoot: string): void {
  const watchDirs = [
    join(projectRoot, '.agentctx', 'specs'),
    join(projectRoot, '.agentctx'),
  ];

  for (const dir of watchDirs) {
    if (!existsSync(dir)) continue;
    try {
      watch(dir, { recursive: true }, (_eventType, filename) => {
        if (filename) broadcastReload(filename);
      });
    } catch {
      watch(dir, (_eventType, filename) => {
        if (filename) broadcastReload(filename);
      });
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function escapeHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonResponse(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

// ── API: Specs ─────────────────────────────────────────────────────────

interface SpecEntry {
  id: string;
  title: string;
  status: string;
  branch: string;
  path: string;
}

async function getSpecs(projectRoot: string): Promise<{ specs: SpecEntry[] }> {
  const specsDir = join(projectRoot, '.agentctx', 'specs');
  const specs: SpecEntry[] = [];
  const seen = new Set<string>();

  // 1. Parse INDEX.md table if it exists
  const indexPath = join(specsDir, 'INDEX.md');
  if (existsSync(indexPath)) {
    try {
      const content = await readFile(indexPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        // Match table rows like: | 0001 | Title | status | branch | path |
        const match = line.match(/\|\s*(\d{4})\s*\|\s*(.*?)\s*\|\s*(draft|approved|in-progress|completed)\s*\|\s*(.*?)\s*\|/i);
        if (match) {
          const [, id, title, status, rest] = match;
          // Try to extract branch from the rest
          const branchMatch = rest.match(/feat\/\S+|fix\/\S+|\S+-\d{4}\S*/);
          const branch = branchMatch ? branchMatch[0] : `feat/${id}-${title.toLowerCase().replace(/\s+/g, '-')}`;
          // Try to find the path reference
          const pathMatch = line.match(/\[.*?\]\((.*?)\)/);
          const specPath = pathMatch ? `.agentctx/specs/${pathMatch[1]}` : `.agentctx/specs/${status.toLowerCase()}-${id}-${title.toLowerCase().replace(/\s+/g, '-')}.md`;
          seen.add(id);
          specs.push({ id, title: title.trim(), status: status.toLowerCase(), branch: branch.trim(), path: specPath });
        }
      }
    } catch { /* ignore */ }
  }

  // 2. Scan specs/ directory for spec files matching {status}-{id}-{name}.md
  if (existsSync(specsDir)) {
    try {
      const entries = await readdir(specsDir);
      for (const entry of entries) {
        if (!entry.endsWith('.md') || entry === 'INDEX.md') continue;
        const match = entry.match(/^(draft|approved|in-progress|completed)-(\d{4})-(.+)\.md$/i);
        if (match && !seen.has(match[2])) {
          const [, status, id, namePart] = match;
          const title = namePart.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          specs.push({
            id,
            title,
            status: status.toLowerCase(),
            branch: `feat/${id}-${namePart}`,
            path: `.agentctx/specs/${entry}`,
          });
        }
      }
    } catch { /* ignore */ }
  }

  return { specs };
}

// ── API: Modules ───────────────────────────────────────────────────────

interface ModuleEntry {
  name: string;
  filename: string;
  exports: string[];
  files: string[];
  lastModified: string;
  tokens: number;
}

async function getModules(projectRoot: string): Promise<{ modules: ModuleEntry[] }> {
  const modulesDir = join(projectRoot, '.agentctx', 'context', 'modules');
  const modules: ModuleEntry[] = [];

  if (!existsSync(modulesDir)) return { modules };

  try {
    const entries = await readdir(modulesDir);
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const fullPath = join(modulesDir, entry);
      try {
        const content = await readFile(fullPath, 'utf-8');
        const fileStat = await stat(fullPath);
        const name = basename(entry, extname(entry));

        // Parse exports section
        const exportsList: string[] = [];
        const exportsMatch = content.match(/##\s*Exports?\s*\n([\s\S]*?)(?=\n##|\n$|$)/i);
        if (exportsMatch) {
          const lines = exportsMatch[1].split('\n');
          for (const line of lines) {
            const itemMatch = line.match(/^-\s*`(.+?)`/);
            if (itemMatch) exportsList.push(itemMatch[1]);
          }
        }

        // Parse key files section
        const filesList: string[] = [];
        const filesMatch = content.match(/##\s*Key\s*Files?\s*\n([\s\S]*?)(?=\n##|\n$|$)/i);
        if (filesMatch) {
          const lines = filesMatch[1].split('\n');
          for (const line of lines) {
            const itemMatch = line.match(/^-\s*`(.+?)`/);
            if (itemMatch) filesList.push(itemMatch[1]);
          }
        }

        modules.push({
          name,
          filename: entry,
          exports: exportsList,
          files: filesList,
          lastModified: fileStat.mtime.toISOString(),
          tokens: estimateTokens(content),
        });
      } catch { /* skip individual file errors */ }
    }
  } catch { /* ignore */ }

  return { modules };
}

// ── API: Health ────────────────────────────────────────────────────────

interface HealthCheck {
  label: string;
  pass: boolean;
  detail?: string;
}

interface HealthResult {
  score: number;
  max: number;
  checks: HealthCheck[];
  recommendations: string[];
}

async function getHealth(projectRoot: string): Promise<HealthResult> {
  const checks: HealthCheck[] = [];
  const recommendations: string[] = [];
  let score = 0;

  // Import detection logic
  let profile;
  let suggestedSkills: string[] = [];
  try {
    const { analyzeCodebase, suggestSkillNames } = await import('../core/detector.js');
    profile = analyzeCodebase(projectRoot);
    suggestedSkills = suggestSkillNames(profile, projectRoot);
  } catch {
    profile = null;
  }

  // Load config
  let config = null;
  try {
    const { findConfigPath, loadConfig } = await import('../core/config.js');
    const configPath = findConfigPath(projectRoot);
    if (configPath) config = await loadConfig(configPath);
  } catch { /* ignore */ }

  const installedSkills = config?.skills ?? [];

  // Check: .agentctx exists
  if (config) {
    checks.push({ label: '.agentctx initialized', pass: true });
    score += 1;
  } else {
    checks.push({ label: '.agentctx initialized', pass: false, detail: 'No config found' });
    recommendations.push('Run: agentctx init');
  }

  // Check: Skills match stack
  if (config && profile) {
    const missing = suggestedSkills.filter(s => !installedSkills.includes(s));
    if (missing.length === 0 && installedSkills.length > 0) {
      checks.push({ label: 'Skills match stack', pass: true });
      score += 2;
    } else if (missing.length > 0) {
      checks.push({ label: 'Skills match stack', pass: false, detail: `Missing: ${missing.join(', ')}` });
      recommendations.push(`Run: agentctx sync --add ${missing.join(' ')}`);
    } else {
      score += 1;
      checks.push({ label: 'Skills configured', pass: true, detail: 'No specific suggestions' });
    }
  }

  // Check: Modules documented
  const modulesDir = join(projectRoot, '.agentctx', 'context', 'modules');
  let moduleCount = 0;
  let staleModules: string[] = [];
  if (existsSync(modulesDir)) {
    try {
      const entries = await readdir(modulesDir);
      const mdFiles = entries.filter(e => e.endsWith('.md'));
      moduleCount = mdFiles.length;
      for (const file of mdFiles) {
        const fileStat = await stat(join(modulesDir, file));
        const daysSince = Math.floor((Date.now() - fileStat.mtime.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince > 7) staleModules.push(basename(file, '.md'));
      }
    } catch { /* ignore */ }
  }

  if (moduleCount > 0) {
    checks.push({ label: 'Modules documented', pass: true, detail: `${moduleCount} modules` });
    score += 2;
  } else if (config) {
    checks.push({ label: 'Modules documented', pass: false, detail: 'No modules found' });
    recommendations.push('Run: agentctx scan');
  }

  if (staleModules.length > 0) {
    checks.push({ label: `${staleModules.length} module(s) stale`, pass: false, detail: staleModules.join(', ') });
    recommendations.push('Run: agentctx sync');
  } else if (moduleCount > 0) {
    checks.push({ label: 'All modules fresh', pass: true });
    score += 1;
  }

  // Check: architecture.md
  const archPath = join(projectRoot, '.agentctx', 'context', 'architecture.md');
  if (existsSync(archPath)) {
    try {
      const content = await readFile(archPath, 'utf-8');
      const nonComment = content.split('\n').filter(l => l.trim().length > 0 && !l.trim().startsWith('<!--') && !l.trim().startsWith('#'));
      if (nonComment.length > 3) {
        checks.push({ label: 'Architecture documented', pass: true });
        score += 1;
      } else {
        checks.push({ label: 'Architecture documented', pass: false, detail: 'Still a scaffold' });
        recommendations.push('Customize .agentctx/context/architecture.md');
      }
    } catch { /* ignore */ }
  }

  // Check: Specs tracked
  const indexPath = join(projectRoot, 'specs', 'INDEX.md');
  if (existsSync(indexPath)) {
    try {
      const content = await readFile(indexPath, 'utf-8');
      const specLines = content.split('\n').filter(l => /\|\s*(draft|approved|in-progress|completed)\s*\|/i.test(l));
      if (specLines.length > 0) {
        checks.push({ label: 'Specs tracked', pass: true, detail: `${specLines.length} specs` });
        score += 1;
      }
    } catch { /* ignore */ }
  }

  // Check: Checkpoints
  try {
    const { stdout } = await execFileAsync('git', ['tag', '-l', 'cp-*', '--sort=-creatordate'], { cwd: projectRoot, timeout: 5000 });
    const tags = stdout.trim().split('\n').filter(Boolean);
    if (tags.length > 0) {
      checks.push({ label: 'Checkpoints exist', pass: true, detail: `${tags.length} checkpoints` });
      score += 1;
    } else {
      checks.push({ label: 'Checkpoints exist', pass: false });
      recommendations.push('Create a checkpoint: git tag cp-001-description');
    }
  } catch {
    checks.push({ label: 'Git repo accessible', pass: false });
  }

  // Check: decisions.md
  const decisionsPath = join(projectRoot, '.agentctx', 'context', 'decisions.md');
  if (existsSync(decisionsPath)) {
    try {
      const content = await readFile(decisionsPath, 'utf-8');
      const nonComment = content.split('\n').filter(l => l.trim().length > 0 && !l.trim().startsWith('<!--') && !l.trim().startsWith('#'));
      if (nonComment.length > 0) {
        checks.push({ label: 'Decisions documented', pass: true });
        score += 1;
      } else {
        checks.push({ label: 'Decisions documented', pass: false, detail: 'Empty' });
        recommendations.push('Document key decisions in decisions.md');
      }
    } catch { /* ignore */ }
  }

  return {
    score: Math.min(score, 10),
    max: 10,
    checks,
    recommendations,
  };
}

// ── API: Activity ──────────────────────────────────────────────────────

interface ActivityEvent {
  time: string;
  date: string;
  message: string;
  type: 'commit' | 'spec' | 'checkpoint' | 'module';
}

async function getActivity(projectRoot: string): Promise<{ events: ActivityEvent[] }> {
  const events: ActivityEvent[] = [];

  try {
    const { stdout } = await execFileAsync('git', [
      'log', '--oneline', '--format=%ai %s', '-20'
    ], { cwd: projectRoot, timeout: 5000 });

    const lines = stdout.trim().split('\n').filter(Boolean);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

    for (const line of lines) {
      // Format: 2026-03-25 14:30:00 +0530 commit message
      const match = line.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}):\d{2}\s+\S+\s+(.+)$/);
      if (!match) continue;

      const [, dateStr, time, message] = match;
      let dateLabel: string;
      if (dateStr === today) dateLabel = 'Today';
      else if (dateStr === yesterday) dateLabel = 'Yesterday';
      else dateLabel = dateStr;

      // Determine type from message
      let type: ActivityEvent['type'] = 'commit';
      const msgLower = message.toLowerCase();
      if (msgLower.includes('spec') || msgLower.includes('rfc')) type = 'spec';
      else if (msgLower.includes('checkpoint') || msgLower.startsWith('cp-') || /^v?\d+\.\d+/.test(message)) type = 'checkpoint';
      else if (msgLower.includes('module') || msgLower.includes('context')) type = 'module';

      events.push({ time, date: dateLabel, message, type });
    }
  } catch { /* not a git repo or git not available */ }

  return { events };
}

// ── API: Context tree ──────────────────────────────────────────────────

interface ContextFile {
  name: string;
  path: string;
  tokens: number;
}

async function getContextFiles(projectRoot: string): Promise<ContextFile[]> {
  const contextDir = join(projectRoot, '.agentctx', 'context');
  const files: ContextFile[] = [];

  if (!existsSync(contextDir)) return files;

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith('.md')) {
        try {
          const content = await readFile(fullPath, 'utf-8');
          files.push({
            name: entry.name,
            path: relative(projectRoot, fullPath),
            tokens: estimateTokens(content),
          });
        } catch { /* skip */ }
      }
    }
  }

  await walk(contextDir);
  return files;
}

// ── Dashboard HTML ─────────────────────────────────────────────────────

function getDashboardHTML(projectName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(projectName)} — Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #0d1117; --surface: #161b22; --surface-2: #1c2333;
      --border: #30363d; --text: #c9d1d9; --text-dim: #7d8590;
      --accent: #58a6ff; --accent-dim: #1f6feb22; --green: #3fb950;
      --yellow: #d29922; --red: #f85149;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

    /* Header / Tab bar */
    .header { display: flex; align-items: center; border-bottom: 1px solid var(--border); background: var(--surface); padding: 0 24px; flex-shrink: 0; }
    .logo { font-size: 14px; font-weight: 600; color: var(--accent); margin-right: 32px; display: flex; align-items: center; gap: 8px; padding: 14px 0; letter-spacing: 0.3px; }
    .logo svg { flex-shrink: 0; }
    .tabs { display: flex; gap: 0; }
    .tab { padding: 14px 18px; font-size: 13px; color: var(--text-dim); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; font-weight: 500; user-select: none; }
    .tab:hover { color: var(--text); background: var(--surface-2); }
    .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
    .live { width: 6px; height: 6px; background: var(--green); border-radius: 50%; display: inline-block; margin-left: 8px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

    /* Main content */
    .main { flex: 1; overflow-y: auto; padding: 24px 32px; }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }

    /* Kanban (Specs tab) */
    .kanban { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; min-height: 300px; }
    .kanban-col { background: var(--surface); border-radius: 8px; padding: 12px; border: 1px solid var(--border); }
    .kanban-col-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .kanban-col-title .count { background: var(--surface-2); border-radius: 10px; padding: 1px 7px; font-size: 11px; }
    .spec-card { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: border-color 0.15s; }
    .spec-card:hover { border-color: var(--accent); }
    .spec-id { font-size: 11px; color: var(--accent); font-family: 'SF Mono', 'Fira Code', monospace; font-weight: 600; margin-bottom: 4px; }
    .spec-title { font-size: 13px; font-weight: 500; margin-bottom: 6px; }
    .spec-branch { font-size: 11px; color: var(--text-dim); font-family: 'SF Mono', 'Fira Code', monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .spec-actions { margin-top: 8px; display: flex; gap: 6px; }

    /* Buttons */
    .btn { padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border); font-size: 11px; cursor: pointer; transition: all 0.15s; background: var(--surface); color: var(--text); }
    .btn:hover { border-color: var(--accent); color: var(--accent); }
    .btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .btn-primary:hover { opacity: 0.85; }
    .btn-green { background: var(--green); color: #000; border-color: var(--green); }
    .btn-green:hover { opacity: 0.85; }
    .btn-accent { background: var(--accent); color: #fff; border-color: var(--accent); }
    .btn-accent:hover { opacity: 0.85; }
    .btn-lg { padding: 8px 20px; font-size: 13px; }

    /* Table (Modules tab) */
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); padding: 8px 12px; border-bottom: 1px solid var(--border); }
    .data-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; }
    .data-table tr { cursor: pointer; transition: background 0.1s; }
    .data-table tbody tr:hover { background: var(--surface); }
    .data-table .stale { color: var(--yellow); }
    .data-table .mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; }
    .module-detail { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 16px; margin: 4px 0 12px; }
    .module-detail h4 { font-size: 12px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .module-detail ul { list-style: none; padding: 0; }
    .module-detail li { font-size: 12px; font-family: 'SF Mono', 'Fira Code', monospace; padding: 2px 0; color: var(--text); }
    .module-detail li::before { content: ''; display: none; }

    /* Health tab */
    .health-grid { display: grid; grid-template-columns: 240px 1fr; gap: 32px; }
    .health-score { display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .score-ring { position: relative; width: 160px; height: 160px; }
    .score-ring svg { transform: rotate(-90deg); }
    .score-ring .bg { fill: none; stroke: var(--surface-2); stroke-width: 10; }
    .score-ring .fg { fill: none; stroke-width: 10; stroke-linecap: round; transition: stroke-dashoffset 0.8s ease, stroke 0.3s; }
    .score-number { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 36px; font-weight: 700; }
    .score-label { font-size: 13px; color: var(--text-dim); margin-top: 8px; }
    .health-checks { }
    .check-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
    .check-icon { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; }
    .check-icon.pass { background: #3fb95022; color: var(--green); }
    .check-icon.fail { background: #f8514922; color: var(--red); }
    .check-detail { font-size: 11px; color: var(--text-dim); margin-left: auto; }
    .recommendations { margin-top: 24px; }
    .recommendations h3 { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
    .rec-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 6px; font-size: 13px; font-family: 'SF Mono', 'Fira Code', monospace; cursor: pointer; transition: border-color 0.15s; }
    .rec-item:hover { border-color: var(--accent); }
    .rec-item::after { content: 'Copy'; font-family: -apple-system, sans-serif; font-size: 10px; color: var(--text-dim); margin-left: auto; }
    .rec-item.copied::after { content: 'Copied!'; color: var(--green); }

    /* Context tab */
    .context-grid { display: grid; grid-template-columns: 280px 1fr; gap: 0; height: calc(100vh - 120px); }
    .context-tree { border-right: 1px solid var(--border); padding: 12px; overflow-y: auto; }
    .context-viewer { padding: 24px; overflow-y: auto; }
    .ctx-file { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 5px; cursor: pointer; font-size: 13px; transition: all 0.1s; }
    .ctx-file:hover { background: var(--surface); }
    .ctx-file.active { background: var(--accent-dim); color: var(--accent); }
    .ctx-file .tokens { font-size: 11px; color: var(--text-dim); margin-left: auto; font-family: 'SF Mono', 'Fira Code', monospace; }
    .ctx-file svg { flex-shrink: 0; color: var(--text-dim); }
    .ctx-file.active svg { color: var(--accent); }

    /* Activity tab */
    .timeline { max-width: 700px; }
    .timeline-day { margin-bottom: 24px; }
    .timeline-day-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
    .timeline-event { display: flex; align-items: flex-start; gap: 12px; padding: 8px 0; }
    .event-icon { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 13px; }
    .event-icon.commit { background: #58a6ff22; color: var(--accent); }
    .event-icon.spec { background: #3fb95022; color: var(--green); }
    .event-icon.checkpoint { background: #d2992222; color: var(--yellow); }
    .event-icon.module { background: #bc8cff22; color: #bc8cff; }
    .event-message { font-size: 13px; line-height: 1.5; }
    .event-time { font-size: 11px; color: var(--text-dim); font-family: 'SF Mono', 'Fira Code', monospace; margin-left: auto; flex-shrink: 0; }

    /* Modal / Slideout */
    .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 50; }
    .modal-overlay.show { display: block; }
    .modal { position: fixed; top: 0; right: 0; width: 60%; max-width: 700px; height: 100%; background: var(--bg); border-left: 1px solid var(--border); z-index: 51; overflow-y: auto; padding: 24px 32px; transform: translateX(100%); transition: transform 0.25s ease; }
    .modal-overlay.show .modal { transform: translateX(0); }
    .modal-close { position: absolute; top: 16px; right: 16px; background: none; border: 1px solid var(--border); color: var(--text-dim); width: 28px; height: 28px; border-radius: 4px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; }
    .modal-close:hover { border-color: var(--accent); color: var(--accent); }

    /* Markdown rendering */
    .md { line-height: 1.7; font-size: 15px; }
    .md h1 { font-size: 24px; font-weight: 600; margin: 20px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
    .md h2 { font-size: 20px; font-weight: 600; margin: 16px 0 10px; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
    .md h3 { font-size: 16px; font-weight: 600; margin: 14px 0 8px; }
    .md p { margin: 0 0 10px; }
    .md code { background: var(--surface-2); padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: 'SF Mono', 'Fira Code', monospace; }
    .md pre { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px; overflow-x: auto; margin: 0 0 14px; }
    .md pre code { background: none; padding: 0; font-size: 13px; line-height: 1.5; }
    .md ul, .md ol { margin: 0 0 10px; padding-left: 22px; }
    .md li { margin: 3px 0; }
    .md blockquote { border-left: 3px solid var(--accent); padding: 4px 14px; color: var(--text-dim); margin: 0 0 10px; }
    .md table { width: 100%; border-collapse: collapse; margin: 0 0 14px; }
    .md th, .md td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; }
    .md th { background: var(--surface); font-weight: 600; }

    /* Empty state */
    .empty-state { text-align: center; padding: 60px 24px; color: var(--text-dim); }
    .empty-state h3 { font-size: 18px; color: var(--text); margin-bottom: 8px; }
    .empty-state p { font-size: 14px; max-width: 400px; margin: 0 auto 16px; line-height: 1.6; }
    .empty-state code { background: var(--surface-2); padding: 4px 10px; border-radius: 4px; font-size: 13px; font-family: 'SF Mono', 'Fira Code', monospace; }

    /* Toolbar */
    .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .toolbar h2 { font-size: 18px; font-weight: 600; flex: 1; }

    /* Toast */
    .toast { position: fixed; bottom: 20px; right: 20px; background: var(--green); color: #000; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 60; }
    .toast.show { opacity: 1; }

    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="M5 5.5h6M5 8h4M5 10.5h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      ${escapeHTML(projectName)}
      <span class="live" title="Live reload"></span>
    </div>
    <div class="tabs">
      <div class="tab active" data-tab="specs">Specs</div>
      <div class="tab" data-tab="modules">Modules</div>
      <div class="tab" data-tab="context">Context</div>
      <div class="tab" data-tab="health">Health</div>
      <div class="tab" data-tab="activity">Activity</div>
    </div>
  </div>

  <div class="main">
    <div class="tab-panel active" id="panel-specs">
      <div class="toolbar">
        <h2>Spec Board</h2>
      </div>
      <div id="specs-content"></div>
    </div>

    <div class="tab-panel" id="panel-modules">
      <div class="toolbar">
        <h2>Modules</h2>
        <button class="btn btn-primary" onclick="runSync()">Sync</button>
      </div>
      <div id="modules-content"></div>
    </div>

    <div class="tab-panel" id="panel-context">
      <div id="context-content"></div>
    </div>

    <div class="tab-panel" id="panel-health">
      <div class="toolbar">
        <h2>Project Health</h2>
        <button class="btn" onclick="loadHealth()">Run Doctor</button>
        <button class="btn btn-primary" onclick="runSync()">Run Sync</button>
      </div>
      <div id="health-content"></div>
    </div>

    <div class="tab-panel" id="panel-activity">
      <div class="toolbar">
        <h2>Activity</h2>
      </div>
      <div id="activity-content"></div>
    </div>
  </div>

  <!-- Modal for spec detail -->
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" id="modal">
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <div id="modal-content"></div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script>
    // ── State ──
    let expandedModule = null;

    // ── Utils ──
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }

    function closeModal() {
      document.getElementById('modal-overlay').classList.remove('show');
    }

    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // ── Tabs ──
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
        // Lazy load
        if (tab.dataset.tab === 'specs') loadSpecs();
        else if (tab.dataset.tab === 'modules') loadModules();
        else if (tab.dataset.tab === 'context') loadContext();
        else if (tab.dataset.tab === 'health') loadHealth();
        else if (tab.dataset.tab === 'activity') loadActivity();
      });
    });

    // ── Specs ──
    async function loadSpecs() {
      const res = await fetch('/api/specs');
      const data = await res.json();
      const el = document.getElementById('specs-content');

      // Create buttons always shown
      let topBar = '<div style="display:flex;gap:8px;margin-bottom:16px">';
      topBar += '<button class="btn btn-accent" onclick="showCreateForm(\\'spec\\')">+ New Spec</button>';
      topBar += '<button class="btn" onclick="showCreateForm(\\'brd\\')">+ New BRD</button>';
      topBar += '</div>';

      if (data.specs.length === 0) {
        el.innerHTML = topBar + '<div class="empty-state"><h3>No specs yet</h3><p>Create your first spec or BRD to start planning.</p></div>';
        return;
      }

      const cols = { draft: [], approved: [], 'in-progress': [], completed: [] };
      for (const s of data.specs) {
        (cols[s.status] || cols.draft).push(s);
      }

      let html = '<div class="kanban">';
      const colMeta = [
        { key: 'draft', label: 'Draft' },
        { key: 'approved', label: 'Approved' },
        { key: 'in-progress', label: 'In Progress' },
        { key: 'completed', label: 'Completed' },
      ];

      for (const col of colMeta) {
        const items = cols[col.key];
        html += '<div class="kanban-col"><div class="kanban-col-title">' + esc(col.label) + ' <span class="count">' + items.length + '</span></div>';
        for (const s of items) {
          html += '<div class="spec-card" onclick="viewSpec(\\'' + esc(s.path) + '\\')">';
          html += '<div class="spec-id">#' + esc(s.id) + '</div>';
          html += '<div class="spec-title">' + esc(s.title) + '</div>';
          html += '<div class="spec-branch">' + esc(s.branch) + '</div>';
          if (s.status === 'draft') {
            html += '<div class="spec-actions"><button class="btn btn-green" onclick="event.stopPropagation(); approveSpec(\\'' + esc(s.path) + '\\')">Approve</button></div>';
          } else if (s.status === 'approved') {
            html += '<div class="spec-actions"><button class="btn" onclick="event.stopPropagation(); showImplement(\\'' + esc(s.id) + '\\', \\'' + esc(s.branch) + '\\')">Implement</button></div>';
          }
          html += '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
      el.innerHTML = topBar + html;
    }

    function showCreateForm(type) {
      const label = type === 'brd' ? 'Business Requirement' : 'Feature Spec';
      document.getElementById('modal-content').innerHTML =
        '<h2 style="margin-bottom:16px">New ' + label + '</h2>' +
        '<div style="margin-bottom:12px"><label style="font-size:13px;color:var(--text-dim);display:block;margin-bottom:4px">Title</label>' +
        '<input id="create-title" type="text" placeholder="e.g., Add user authentication" style="width:100%;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:14px;outline:none" autofocus></div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button class="btn" onclick="closeModal()">Cancel</button>' +
        '<button class="btn btn-accent" onclick="createSpec(\\'' + type + '\\')">Create</button></div>';
      document.getElementById('modal-overlay').classList.add('show');
      setTimeout(() => document.getElementById('create-title')?.focus(), 100);
    }

    async function createSpec(type) {
      const title = document.getElementById('create-title')?.value;
      if (!title) { showToast('Title required'); return; }
      try {
        const res = await fetch('/api/spec/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, title }),
        });
        const data = await res.json();
        if (data.ok) {
          showToast((type === 'brd' ? 'BRD' : 'Spec') + ' #' + data.id + ' created');
          closeModal();
          loadSpecs();
        } else {
          showToast(data.error || 'Failed');
        }
      } catch { showToast('Failed to create'); }
    }

    let currentEditPath = null;

    async function viewSpec(path) {
      try {
        const res = await fetch('/api/spec?path=' + encodeURIComponent(path));
        const md = await res.text();
        currentEditPath = path;
        document.getElementById('modal-content').innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border)">' +
          '<span style="font-size:12px;color:var(--text-dim);font-family:monospace">' + esc(path) + '</span>' +
          '<button class="btn" onclick="editSpec(\\'' + esc(path) + '\\')">Edit</button></div>' +
          '<div class="md">' + marked.parse(md) + '</div>';
        document.getElementById('modal-overlay').classList.add('show');
      } catch {
        showToast('Could not load spec');
      }
    }

    async function editSpec(path) {
      try {
        const res = await fetch('/api/spec?path=' + encodeURIComponent(path));
        const content = await res.text();
        document.getElementById('modal-content').innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
          '<span style="font-size:12px;color:var(--text-dim);font-family:monospace">' + esc(path) + '</span>' +
          '<div style="display:flex;gap:8px"><button class="btn" onclick="viewSpec(\\'' + esc(path) + '\\')">Cancel</button>' +
          '<button class="btn btn-accent" onclick="saveSpec(\\'' + esc(path) + '\\')">Save</button></div></div>' +
          '<textarea id="spec-editor" style="width:100%;height:60vh;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:16px;font-family:\\'SF Mono\\',monospace;font-size:13px;line-height:1.6;resize:none;outline:none;tab-size:2"></textarea>';
        document.getElementById('spec-editor').value = content;
        document.getElementById('spec-editor').addEventListener('keydown', (e) => {
          if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveSpec(path); }
          if (e.key === 'Tab') { e.preventDefault(); const s = e.target.selectionStart; e.target.value = e.target.value.substring(0,s) + '  ' + e.target.value.substring(e.target.selectionEnd); e.target.selectionStart = e.target.selectionEnd = s + 2; }
        });
      } catch { showToast('Could not load spec'); }
    }

    async function saveSpec(path) {
      const content = document.getElementById('spec-editor')?.value;
      if (!content) return;
      try {
        const res = await fetch('/api/file/save?path=' + encodeURIComponent(path), { method: 'POST', body: content });
        if (res.ok) { showToast('Saved'); viewSpec(path); loadSpecs(); }
        else { showToast('Save failed'); }
      } catch { showToast('Save failed'); }
    }

    async function approveSpec(path) {
      try {
        const res = await fetch('/api/spec/approve?path=' + encodeURIComponent(path), { method: 'POST' });
        if (res.ok) {
          showToast('Spec approved');
          loadSpecs();
        } else {
          const data = await res.json();
          showToast(data.error || 'Failed to approve');
        }
      } catch {
        showToast('Failed to approve spec');
      }
    }

    function showImplement(id, branch) {
      document.getElementById('modal-content').innerHTML =
        '<h2 style="margin-bottom:16px">Implement Spec #' + esc(id) + '</h2>' +
        '<p style="margin-bottom:12px;color:var(--text-dim)">Run these commands to start implementation:</p>' +
        '<pre style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px;font-family:\\'SF Mono\\',monospace;font-size:13px;line-height:1.6">' +
        'git checkout -b ' + esc(branch) + '\\n' +
        '# Start coding the spec\\n' +
        '# When done, update spec status to in-progress' +
        '</pre>';
      document.getElementById('modal-overlay').classList.add('show');
    }

    // ── Modules ──
    async function loadModules() {
      const res = await fetch('/api/modules');
      const data = await res.json();
      const el = document.getElementById('modules-content');

      if (data.modules.length === 0) {
        el.innerHTML = '<div class="empty-state"><h3>No modules found</h3><p>Modules document your codebase architecture for AI agents. Run a scan to generate them.</p><code>agentctx scan</code></div>';
        return;
      }

      const now = Date.now();
      let html = '<table class="data-table"><thead><tr><th>Name</th><th>Key Files</th><th>Exports</th><th>Last Modified</th><th>Tokens</th></tr></thead><tbody>';

      for (const m of data.modules) {
        const modified = new Date(m.lastModified);
        const daysAgo = Math.floor((now - modified.getTime()) / 86400000);
        const isStale = daysAgo > 7;
        const dateStr = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : daysAgo + ' days ago';
        const rowId = 'mod-' + m.name;

        html += '<tr onclick="toggleModule(\\'' + esc(m.name) + '\\')" id="row-' + esc(m.name) + '">';
        html += '<td><strong>' + esc(m.name) + '</strong></td>';
        html += '<td class="mono">' + m.files.length + ' files</td>';
        html += '<td class="mono">' + m.exports.length + '</td>';
        html += '<td class="' + (isStale ? 'stale' : '') + '">' + esc(dateStr) + (isStale ? ' (stale)' : '') + '</td>';
        html += '<td class="mono">' + m.tokens.toLocaleString() + '</td>';
        html += '</tr>';

        // Expandable detail row
        html += '<tr id="detail-' + esc(m.name) + '" style="display:none"><td colspan="5"><div class="module-detail">';
        if (m.files.length > 0) {
          html += '<h4>Key Files</h4><ul>';
          for (const f of m.files) html += '<li>' + esc(f) + '</li>';
          html += '</ul>';
        }
        if (m.exports.length > 0) {
          html += '<h4 style="margin-top:12px">Exports</h4><ul>';
          for (const e of m.exports) html += '<li>' + esc(e) + '</li>';
          html += '</ul>';
        }
        html += '</div></td></tr>';
      }

      html += '</tbody></table>';
      el.innerHTML = html;
    }

    function toggleModule(name) {
      const detail = document.getElementById('detail-' + name);
      if (!detail) return;
      if (expandedModule === name) {
        detail.style.display = 'none';
        expandedModule = null;
      } else {
        // Collapse previous
        if (expandedModule) {
          const prev = document.getElementById('detail-' + expandedModule);
          if (prev) prev.style.display = 'none';
        }
        detail.style.display = '';
        expandedModule = name;
      }
    }

    // ── Context ──
    async function loadContext() {
      const res = await fetch('/api/context');
      const files = await res.json();
      const el = document.getElementById('context-content');

      if (files.length === 0) {
        el.innerHTML = '<div class="empty-state"><h3>No context files</h3><p>Initialize agentctx to create context files for AI agents.</p><code>agentctx init</code></div>';
        return;
      }

      let treeHTML = '';
      for (const f of files) {
        treeHTML += '<div class="ctx-file" data-path="' + esc(f.path) + '" onclick="viewContextFile(this, \\'' + esc(f.path) + '\\')">' +
          '<svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 1.5A1.5 1.5 0 014.5 0h5.379a1.5 1.5 0 011.06.44l2.122 2.12A1.5 1.5 0 0113.5 3.622V14.5a1.5 1.5 0 01-1.5 1.5h-8A1.5 1.5 0 013 14.5v-13z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>' +
          '<span>' + esc(f.name) + '</span>' +
          '<span class="tokens">' + f.tokens + '</span>' +
          '</div>';
      }

      el.innerHTML = '<div class="context-grid"><div class="context-tree">' + treeHTML + '</div><div class="context-viewer" id="ctx-viewer"><div class="empty-state"><p>Select a file to view</p></div></div></div>';
    }

    async function viewContextFile(el, path) {
      document.querySelectorAll('.ctx-file').forEach(f => f.classList.remove('active'));
      el.classList.add('active');
      try {
        const res = await fetch('/api/file?path=' + encodeURIComponent(path));
        const text = await res.text();
        document.getElementById('ctx-viewer').innerHTML = '<div class="md">' + marked.parse(text) + '</div>';
      } catch {
        document.getElementById('ctx-viewer').innerHTML = '<div class="empty-state"><p>Could not load file</p></div>';
      }
    }

    // ── Health ──
    async function loadHealth() {
      const el = document.getElementById('health-content');
      el.innerHTML = '<div style="color:var(--text-dim);padding:20px">Loading...</div>';

      const res = await fetch('/api/health');
      const data = await res.json();

      const pct = data.score / data.max;
      const circumference = 2 * Math.PI * 65;
      const offset = circumference * (1 - pct);
      const color = data.score >= 8 ? 'var(--green)' : data.score >= 5 ? 'var(--yellow)' : 'var(--red)';

      let html = '<div class="health-grid"><div class="health-score">' +
        '<div class="score-ring"><svg width="160" height="160" viewBox="0 0 160 160">' +
        '<circle class="bg" cx="80" cy="80" r="65"/>' +
        '<circle class="fg" cx="80" cy="80" r="65" stroke="' + color + '" stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '"/>' +
        '</svg><div class="score-number" style="color:' + color + '">' + data.score + '</div></div>' +
        '<div class="score-label">out of ' + data.max + '</div>' +
        '</div><div class="health-checks">';

      for (const c of data.checks) {
        html += '<div class="check-item">' +
          '<div class="check-icon ' + (c.pass ? 'pass' : 'fail') + '">' + (c.pass ? '\u2713' : '\u2717') + '</div>' +
          '<span>' + esc(c.label) + '</span>' +
          (c.detail ? '<span class="check-detail">' + esc(c.detail) + '</span>' : '') +
          '</div>';
      }

      html += '</div></div>';

      if (data.recommendations.length > 0) {
        html += '<div class="recommendations"><h3>Recommendations</h3>';
        for (const r of data.recommendations) {
          html += '<div class="rec-item" onclick="copyRec(this, \\'' + esc(r).replace(/'/g, "\\\\'") + '\\')">' + esc(r) + '</div>';
        }
        html += '</div>';
      }

      el.innerHTML = html;
    }

    function copyRec(el, text) {
      navigator.clipboard.writeText(text).then(() => {
        el.classList.add('copied');
        setTimeout(() => el.classList.remove('copied'), 1500);
      });
    }

    // ── Activity ──
    async function loadActivity() {
      const res = await fetch('/api/activity');
      const data = await res.json();
      const el = document.getElementById('activity-content');

      if (data.events.length === 0) {
        el.innerHTML = '<div class="empty-state"><h3>No activity yet</h3><p>Activity is derived from your git history. Make some commits to see them here.</p></div>';
        return;
      }

      // Group by date
      const groups = {};
      for (const e of data.events) {
        if (!groups[e.date]) groups[e.date] = [];
        groups[e.date].push(e);
      }

      const iconMap = {
        commit: '\u2022',
        spec: '\u2606',
        checkpoint: '\u2691',
        module: '\u25CB',
      };

      let html = '<div class="timeline">';
      for (const [date, events] of Object.entries(groups)) {
        html += '<div class="timeline-day"><div class="timeline-day-label">' + esc(date) + '</div>';
        for (const e of events) {
          html += '<div class="timeline-event">' +
            '<div class="event-icon ' + esc(e.type) + '">' + (iconMap[e.type] || '\u2022') + '</div>' +
            '<div class="event-message">' + esc(e.message) + '</div>' +
            '<div class="event-time">' + esc(e.time) + '</div>' +
            '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
      el.innerHTML = html;
    }

    // ── Sync ──
    async function runSync() {
      try {
        const res = await fetch('/api/sync', { method: 'POST' });
        if (res.ok) showToast('Sync started');
        else showToast('Sync failed to start');
      } catch {
        showToast('Sync failed');
      }
    }

    // ── SSE live reload ──
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      // Reload current tab data
      const activeTab = document.querySelector('.tab.active');
      if (activeTab) activeTab.click();
    };

    // ── Init: load first tab ──
    loadSpecs();
  </script>
</body>
</html>`;
}

// ── Server ─────────────────────────────────────────────────────────────

function openBrowser(url: string): void {
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} ${url}`);
}

export async function dashboardCommand(options: DashboardOptions): Promise<void> {
  const projectRoot = process.cwd();
  const port = parseInt(options.port, 10);

  let projectName = projectRoot.split('/').pop() || 'Project';
  try {
    const { findConfigPath, loadConfig } = await import('../core/config.js');
    const configPath = findConfigPath(projectRoot);
    if (configPath) {
      const config = await loadConfig(configPath);
      projectName = config.project.name;
    }
  } catch { /* use directory name */ }

  const html = getDashboardHTML(projectName);
  setupFileWatcher(projectRoot);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    try {
      // SSE endpoint
      if (url.pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
        res.write('data: {"type":"connected"}\n\n');
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      // API: Specs list
      if (url.pathname === '/api/specs') {
        const data = await getSpecs(projectRoot);
        jsonResponse(res, data);
        return;
      }

      // API: Modules list
      if (url.pathname === '/api/modules') {
        const data = await getModules(projectRoot);
        jsonResponse(res, data);
        return;
      }

      // API: Health
      if (url.pathname === '/api/health') {
        const data = await getHealth(projectRoot);
        jsonResponse(res, data);
        return;
      }

      // API: Activity
      if (url.pathname === '/api/activity') {
        const data = await getActivity(projectRoot);
        jsonResponse(res, data);
        return;
      }

      // API: Context files list
      if (url.pathname === '/api/context') {
        const files = await getContextFiles(projectRoot);
        jsonResponse(res, files);
        return;
      }

      // API: Read a specific file (for context viewer and spec viewer)
      if (url.pathname === '/api/file') {
        const filePath = url.searchParams.get('path');
        if (!filePath) { res.writeHead(400); res.end('Missing path'); return; }
        const resolved = join(projectRoot, filePath);
        if (!resolved.startsWith(projectRoot)) { res.writeHead(403); res.end('Forbidden'); return; }
        try {
          const content = await readFile(resolved, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
          res.end(content);
        } catch {
          res.writeHead(404); res.end('Not found');
        }
        return;
      }

      // API: Read spec
      if (url.pathname === '/api/spec' && req.method === 'GET') {
        const specPath = url.searchParams.get('path');
        if (!specPath) { res.writeHead(400); res.end('Missing path'); return; }
        const resolved = join(projectRoot, specPath);
        if (!resolved.startsWith(projectRoot)) { res.writeHead(403); res.end('Forbidden'); return; }
        try {
          const content = await readFile(resolved, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
          res.end(content);
        } catch {
          res.writeHead(404); res.end('Spec not found');
        }
        return;
      }

      // API: Approve spec
      if (url.pathname === '/api/spec/approve' && req.method === 'POST') {
        const specPath = url.searchParams.get('path');
        if (!specPath) { jsonResponse(res, { error: 'Missing path' }, 400); return; }
        const resolved = join(projectRoot, specPath);
        if (!resolved.startsWith(projectRoot)) { jsonResponse(res, { error: 'Forbidden' }, 403); return; }

        // Only draft specs can be approved
        const filename = basename(resolved);
        if (!filename.startsWith('draft-')) {
          jsonResponse(res, { error: 'Only draft specs can be approved' }, 400);
          return;
        }

        const newFilename = filename.replace(/^draft-/, 'approved-');
        const newPath = join(projectRoot, 'specs', newFilename);
        try {
          await rename(resolved, newPath);
          jsonResponse(res, { ok: true, newPath: `.agentctx/specs/${newFilename}` });
        } catch (err) {
          jsonResponse(res, { error: String(err) }, 500);
        }
        return;
      }

      // API: Config
      if (url.pathname === '/api/config') {
        try {
          const { findConfigPath, loadConfig } = await import('../core/config.js');
          const configPath = findConfigPath(projectRoot);
          if (configPath) {
            const config = await loadConfig(configPath);
            jsonResponse(res, config);
          } else {
            jsonResponse(res, { error: 'No config found' }, 404);
          }
        } catch (err) {
          jsonResponse(res, { error: String(err) }, 500);
        }
        return;
      }

      // API: Sync
      if (url.pathname === '/api/sync' && req.method === 'POST') {
        try {
          const { spawn } = await import('node:child_process');
          const child = spawn('npx', ['agentctx', 'sync', '--no-ai'], {
            cwd: projectRoot,
            detached: true,
            stdio: 'ignore',
          });
          child.unref();
          jsonResponse(res, { ok: true, message: 'Sync started in background' });
        } catch (err) {
          jsonResponse(res, { error: String(err) }, 500);
        }
        return;
      }

      // API: Create spec or BRD
      if (url.pathname === '/api/spec/create' && req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            const { type, title } = body as { type: string; title: string };
            if (!title) { jsonResponse(res, { error: 'Title required' }, 400); return; }

            const specsDir = join(projectRoot, '.agentctx', 'specs');
            const templatesDir = join(specsDir, '_templates');
            await mkdir(specsDir, { recursive: true });

            // Find next ID
            let maxId = 0;
            try {
              const files = await readdir(specsDir);
              for (const f of files) {
                const match = f.match(/(?:draft|approved|in-progress|completed)-(?:BRD-)?(\d+)/);
                if (match) maxId = Math.max(maxId, parseInt(match[1]));
              }
            } catch { /* empty dir */ }
            const nextId = String(maxId + 1).padStart(4, '0');

            const kebab = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const isBrd = type === 'brd';
            const prefix = isBrd ? `draft-BRD-${nextId}` : `draft-${nextId}`;
            const filename = `${prefix}-${kebab}.md`;

            // Load template
            const templateName = isBrd ? 'brd-template.md' : 'feature-spec.md';
            const templatePath = join(templatesDir, templateName);
            let content: string;
            try {
              content = await readFile(templatePath, 'utf-8');
              content = content.replace(/NNNN/g, nextId).replace(/\{Title\}|Feature Title/g, title).replace(/YYYY-MM-DD/g, new Date().toISOString().split('T')[0]);
            } catch {
              // No template — create minimal spec
              content = `---\nid: ${nextId}\ntitle: ${title}\nstatus: draft\ncreated: ${new Date().toISOString().split('T')[0]}\n---\n\n# ${title}\n\n## Description\n\n## Acceptance Criteria\n- [ ] \n`;
            }

            await writeFile(join(specsDir, filename), content, 'utf-8');

            // Update INDEX.md
            const indexPath = join(specsDir, 'INDEX.md');
            try {
              let index = await readFile(indexPath, 'utf-8');
              index += `| ${nextId} | ${title} | draft | ${new Date().toISOString().split('T')[0]} | — |\n`;
              await writeFile(indexPath, index, 'utf-8');
            } catch { /* no index */ }

            jsonResponse(res, { ok: true, path: `.agentctx/specs/${filename}`, id: nextId });
          } catch (err) {
            jsonResponse(res, { error: String(err) }, 500);
          }
        });
        return;
      }

      // API: Save file (edit spec or module)
      if (url.pathname === '/api/file/save' && req.method === 'POST') {
        const filePath = url.searchParams.get('path');
        if (!filePath) { jsonResponse(res, { error: 'Missing path' }, 400); return; }
        const resolved = join(projectRoot, filePath);
        if (!resolved.startsWith(projectRoot)) { jsonResponse(res, { error: 'Forbidden' }, 403); return; }

        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
          try {
            const content = Buffer.concat(chunks).toString('utf-8');
            await writeFile(resolved, content, 'utf-8');
            jsonResponse(res, { ok: true });
          } catch (err) {
            jsonResponse(res, { error: String(err) }, 500);
          }
        });
        return;
      }

      // Default: serve dashboard HTML
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  server.listen(port, () => {
    logger.success(`Dashboard running at http://localhost:${port}`);
    logger.dim('Live reload active. Ctrl+C to stop.\n');
    if (options.open !== false) openBrowser(`http://localhost:${port}`);
  });
}
