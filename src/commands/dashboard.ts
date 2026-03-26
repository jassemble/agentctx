import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join, basename, extname, relative } from 'node:path';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { logger } from '../utils/logger.js';
import { estimateTokens } from '../utils/tokens.js';

const execFileAsync = promisify(execFile);

// ── Types ──────────────────────────────────────────────────────────────

interface DashboardOptions {
  port: string;
  open?: boolean;
}

interface SpecEntry {
  id: string;
  title: string;
  status: string;
  branch: string;
  priority: string;
  path: string;
}

interface ModuleEntry {
  name: string;
  filename: string;
  exports: string[];
  files: string[];
  lastModified: string;
  tokens: number;
}

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

interface ActivityEvent {
  time: string;
  date: string;
  message: string;
  type: 'commit' | 'spec' | 'checkpoint' | 'module';
}

interface ContextFile {
  name: string;
  path: string;
  tokens: number;
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

function parseFrontmatter(content: string): Record<string, string> {
  const fm: Record<string, string> = {};
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return fm;
  const lines = match[1].split('\n');
  for (const line of lines) {
    const kv = line.match(/^(\w[\w-]*):\s*"?([^"\n]*)"?\s*$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return fm;
}

async function getSpecs(projectRoot: string): Promise<{ specs: SpecEntry[] }> {
  const specsDir = join(projectRoot, '.agentctx', 'specs');
  const specs: SpecEntry[] = [];
  const seen = new Set<string>();

  // 1. Parse INDEX.md table as fallback
  const indexPath = join(specsDir, 'INDEX.md');
  if (existsSync(indexPath)) {
    try {
      const content = await readFile(indexPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/\|\s*(\d{4})\s*\|\s*(.*?)\s*\|\s*(draft|approved|in-progress|completed|cancelled)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|/i);
        if (match) {
          const [, id, title, status, priority, branch] = match;
          seen.add(id);
          specs.push({
            id,
            title: title.trim(),
            status: status.toLowerCase(),
            priority: priority.trim() || 'P2',
            branch: branch.trim(),
            path: `.agentctx/specs/${id}-${title.trim().toLowerCase().replace(/\s+/g, '-')}.md`,
          });
        }
      }
    } catch { /* ignore */ }
  }

  // 2. Scan specs/ directory for ALL .md files (except INDEX.md and _templates/)
  if (existsSync(specsDir)) {
    try {
      const entries = await readdir(specsDir);
      for (const entry of entries) {
        if (!entry.endsWith('.md') || entry === 'INDEX.md' || entry.startsWith('_')) continue;
        const fullPath = join(specsDir, entry);
        try {
          const fileStat = await stat(fullPath);
          if (fileStat.isDirectory()) continue;
        } catch { continue; }

        try {
          const content = await readFile(fullPath, 'utf-8');
          const fm = parseFrontmatter(content);
          const id = fm.id || entry.match(/^(\d{4})/)?.[1] || '';
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const title = fm.title || entry.replace(/^\d{4}-/, '').replace(/\.md$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const status = fm.status || 'draft';
          const branch = fm.branch || `feat/${id}-${entry.replace(/^\d{4}-/, '').replace(/\.md$/, '')}`;
          const priority = fm.priority || 'P2';
          specs.push({ id, title, status: status.toLowerCase(), branch, priority, path: `.agentctx/specs/${entry}` });
        } catch { /* skip individual file errors */ }
      }
    } catch { /* ignore */ }
  }

  return { specs };
}

// ── API: Modules ───────────────────────────────────────────────────────

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

        const exportsList: string[] = [];
        const exportsMatch = content.match(/##\s*Exports?\s*\n([\s\S]*?)(?=\n##|\n$|$)/i);
        if (exportsMatch) {
          const lines = exportsMatch[1].split('\n');
          for (const line of lines) {
            const itemMatch = line.match(/^-\s*`(.+?)`/);
            if (itemMatch) exportsList.push(itemMatch[1]);
          }
        }

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

async function getHealth(projectRoot: string): Promise<HealthResult> {
  const checks: HealthCheck[] = [];
  const recommendations: string[] = [];
  let score = 0;

  let profile;
  let suggestedSkills: string[] = [];
  try {
    const { analyzeCodebase, suggestSkillNames } = await import('../core/detector.js');
    profile = analyzeCodebase(projectRoot);
    suggestedSkills = suggestSkillNames(profile, projectRoot);
  } catch {
    profile = null;
  }

  let config = null;
  try {
    const { findConfigPath, loadConfig } = await import('../core/config.js');
    const configPath = findConfigPath(projectRoot);
    if (configPath) config = await loadConfig(configPath);
  } catch { /* ignore */ }

  const installedSkills = config?.skills ?? [];

  if (config) {
    checks.push({ label: '.agentctx initialized', pass: true });
    score += 1;
  } else {
    checks.push({ label: '.agentctx initialized', pass: false, detail: 'No config found' });
    recommendations.push('Run: agentctx init');
  }

  if (config && profile) {
    const missing = suggestedSkills.filter(s => !installedSkills.includes(s));
    if (missing.length === 0 && installedSkills.length > 0) {
      checks.push({ label: 'Skills match stack', pass: true });
      score += 2;
    } else if (missing.length > 0) {
      checks.push({ label: 'Skills match stack', pass: false, detail: `Missing: ${missing.join(', ')}` });
      recommendations.push(`Run: agentctx add ${missing.join(' ')}`);
    } else {
      score += 1;
      checks.push({ label: 'Skills configured', pass: true, detail: 'No specific suggestions' });
    }
  }

  const modulesDir = join(projectRoot, '.agentctx', 'context', 'modules');
  let moduleCount = 0;
  const staleModules: string[] = [];
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
    recommendations.push('Run: agentctx generate');
  } else if (moduleCount > 0) {
    checks.push({ label: 'All modules fresh', pass: true });
    score += 1;
  }

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

  const specIndexPath = join(projectRoot, '.agentctx', 'specs', 'INDEX.md');
  if (existsSync(specIndexPath)) {
    try {
      const content = await readFile(specIndexPath, 'utf-8');
      const specLines = content.split('\n').filter(l => /\|\s*(draft|approved|in-progress|completed|cancelled)\s*\|/i.test(l));
      if (specLines.length > 0) {
        checks.push({ label: 'Specs tracked', pass: true, detail: `${specLines.length} specs` });
        score += 1;
      }
    } catch { /* ignore */ }
  }

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

  return { score: Math.min(score, 10), max: 10, checks, recommendations };
}

// ── API: Activity ──────────────────────────────────────────────────────

async function getActivity(projectRoot: string): Promise<{ events: ActivityEvent[] }> {
  const events: ActivityEvent[] = [];

  try {
    const { stdout } = await execFileAsync('git', [
      'log', '--oneline', '--format=%ai %s', '-20',
    ], { cwd: projectRoot, timeout: 5000 });

    const lines = stdout.trim().split('\n').filter(Boolean);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

    for (const line of lines) {
      const match = line.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}):\d{2}\s+\S+\s+(.+)$/);
      if (!match) continue;

      const [, dateStr, time, message] = match;
      let dateLabel: string;
      if (dateStr === today) dateLabel = 'Today';
      else if (dateStr === yesterday) dateLabel = 'Yesterday';
      else dateLabel = dateStr;

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

function getCSS(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --color-bg: #0d1117;
      --color-surface: #161b22;
      --color-surface-raised: #1c2333;
      --color-border: #30363d;
      --color-text-primary: #c9d1d9;
      --color-text-secondary: #7d8590;
      --color-primary: #58a6ff;
      --color-primary-muted: #1f6feb22;
      --color-success: #3fb950;
      --color-warning: #d29922;
      --color-error: #f85149;
      --color-module: #bc8cff;
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-5: 20px;
      --space-6: 24px;
      --space-8: 32px;
      --space-12: 48px;
      --space-16: 64px;
      --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      --radius-sm: 4px;
      --radius-md: 6px;
      --radius-lg: 8px;
    }

    body {
      font-family: var(--font-sans);
      background: var(--color-bg);
      color: var(--color-text-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Header / Tab bar */
    .header {
      display: flex;
      align-items: center;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
      padding: 0 var(--space-6);
      flex-shrink: 0;
    }
    .logo {
      font-size: 14px;
      font-weight: 600;
      color: var(--color-primary);
      margin-right: var(--space-8);
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: 14px 0;
      letter-spacing: 0.3px;
    }
    .logo svg { flex-shrink: 0; }
    .tabs { display: flex; gap: 0; }
    .tab {
      padding: 14px 18px;
      font-size: 13px;
      color: var(--color-text-secondary);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: color 0.15s ease-out, background 0.15s ease-out;
      font-weight: 500;
      user-select: none;
    }
    .tab:hover { color: var(--color-text-primary); background: var(--color-surface-raised); }
    .tab:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
    .tab.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
    .live {
      width: 6px; height: 6px;
      background: var(--color-success);
      border-radius: 50%;
      display: inline-block;
      margin-left: var(--space-2);
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    @media (prefers-reduced-motion: reduce) {
      .live { animation: none; }
      * { transition-duration: 0s !important; }
    }

    /* Main content */
    .main { flex: 1; overflow-y: auto; padding: var(--space-6) var(--space-8); }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }

    /* Kanban (Specs tab) */
    .kanban { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4); min-height: 300px; }
    .kanban-col {
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      padding: var(--space-3);
      border: 1px solid var(--color-border);
    }
    .kanban-col-title {
      font-size: 12px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.5px;
      color: var(--color-text-secondary);
      margin-bottom: var(--space-3);
      display: flex; align-items: center; gap: var(--space-2);
    }
    .kanban-col-title .count {
      background: var(--color-surface-raised);
      border-radius: 10px;
      padding: 1px 7px;
      font-size: 11px;
    }
    .spec-card {
      background: var(--color-surface-raised);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      margin-bottom: var(--space-2);
      cursor: pointer;
      transition: border-color 0.15s ease-out;
    }
    .spec-card:hover { border-color: var(--color-primary); }
    .spec-card:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
    .spec-id {
      font-size: 11px; color: var(--color-primary);
      font-family: var(--font-mono); font-weight: 600;
      margin-bottom: var(--space-1);
    }
    .spec-title { font-size: 13px; font-weight: 500; margin-bottom: var(--space-2); }
    .spec-branch {
      font-size: 11px; color: var(--color-text-secondary);
      font-family: var(--font-mono);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .spec-priority { float: right; font-size: 10px; color: var(--color-text-secondary); }
    .spec-actions { margin-top: var(--space-2); display: flex; gap: var(--space-2); }

    /* Buttons */
    .btn {
      padding: var(--space-1) 10px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border);
      font-size: 11px; cursor: pointer;
      transition: border-color 0.15s ease-out, color 0.15s ease-out;
      background: var(--color-surface);
      color: var(--color-text-primary);
      font-family: var(--font-sans);
    }
    .btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
    .btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
    .btn-primary { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
    .btn-primary:hover { opacity: 0.85; color: #fff; }
    .btn-success { background: var(--color-success); color: #0d1117; border-color: var(--color-success); }
    .btn-success:hover { opacity: 0.85; color: #0d1117; }
    .btn-lg { padding: var(--space-2) var(--space-5); font-size: 13px; }

    /* Table (Modules tab) */
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th {
      text-align: left; font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.5px;
      color: var(--color-text-secondary);
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--color-border);
    }
    .data-table td {
      padding: 10px var(--space-3);
      border-bottom: 1px solid var(--color-border);
      font-size: 13px;
    }
    .data-table tr { cursor: pointer; transition: background 0.1s ease-out; }
    .data-table tbody tr:hover { background: var(--color-surface); }
    .data-table .stale { color: var(--color-warning); }
    .data-table .mono { font-family: var(--font-mono); font-size: 12px; }
    .module-detail {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      margin: var(--space-1) 0 var(--space-3);
    }
    .module-detail h4 {
      font-size: 12px; color: var(--color-text-secondary);
      text-transform: uppercase; letter-spacing: 0.5px;
      margin-bottom: var(--space-2);
    }
    .module-detail ul { list-style: none; padding: 0; }
    .module-detail li {
      font-size: 12px; font-family: var(--font-mono);
      padding: 2px 0; color: var(--color-text-primary);
    }

    /* Health tab */
    .health-grid { display: grid; grid-template-columns: 240px 1fr; gap: var(--space-8); }
    .health-score { display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .score-ring { position: relative; width: 160px; height: 160px; }
    .score-ring svg { transform: rotate(-90deg); }
    .score-ring .bg { fill: none; stroke: var(--color-surface-raised); stroke-width: 10; }
    .score-ring .fg { fill: none; stroke-width: 10; stroke-linecap: round; transition: stroke-dashoffset 0.8s ease-out, stroke 0.3s ease-out; }
    .score-number { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 36px; font-weight: 700; }
    .score-label { font-size: 13px; color: var(--color-text-secondary); margin-top: var(--space-2); }
    .check-item {
      display: flex; align-items: center; gap: 10px;
      padding: var(--space-2) 0;
      border-bottom: 1px solid var(--color-border);
      font-size: 13px;
    }
    .check-icon {
      width: 20px; height: 20px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; flex-shrink: 0;
    }
    .check-icon.pass { background: #3fb95022; color: var(--color-success); }
    .check-icon.fail { background: #f8514922; color: var(--color-error); }
    .check-detail { font-size: 11px; color: var(--color-text-secondary); margin-left: auto; }
    .recommendations { margin-top: var(--space-6); }
    .recommendations h3 { font-size: 14px; font-weight: 600; margin-bottom: var(--space-3); }
    .rec-item {
      display: flex; align-items: center; gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      margin-bottom: var(--space-2);
      font-size: 13px; font-family: var(--font-mono);
      cursor: pointer; transition: border-color 0.15s ease-out;
    }
    .rec-item:hover { border-color: var(--color-primary); }
    .rec-item::after {
      content: 'Copy'; font-family: var(--font-sans);
      font-size: 10px; color: var(--color-text-secondary); margin-left: auto;
    }
    .rec-item.copied::after { content: 'Copied!'; color: var(--color-success); }

    /* Context tab */
    .context-grid { display: grid; grid-template-columns: 280px 1fr; gap: 0; height: calc(100vh - 120px); }
    .context-tree { border-right: 1px solid var(--color-border); padding: var(--space-2); overflow-y: auto; }
    .context-viewer { padding: var(--space-6); overflow-y: auto; }
    .ctx-toolbar { display: flex; gap: var(--space-2); padding: var(--space-2) var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-border); margin-bottom: var(--space-2); }
    .ctx-toolbar-btn { background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text-secondary); padding: 3px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; }
    .ctx-toolbar-btn.active { background: var(--color-primary-muted); color: var(--color-primary); border-color: var(--color-primary); }
    .ctx-search { width: 100%; padding: 4px 8px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-text-primary); font-size: 12px; outline: none; margin-bottom: var(--space-2); }
    .ctx-search:focus { border-color: var(--color-primary); }
    .ctx-folder { }
    .ctx-folder-head { display: flex; align-items: center; gap: 4px; padding: 3px 6px; cursor: pointer; border-radius: 5px; font-size: 12px; color: var(--color-text-secondary); font-weight: 500; user-select: none; }
    .ctx-folder-head:hover { background: var(--color-surface); color: var(--color-text-primary); }
    .ctx-folder-chevron { transition: transform 0.15s ease; flex-shrink: 0; }
    .ctx-folder:not(.collapsed) > .ctx-folder-head .ctx-folder-chevron { transform: rotate(90deg); }
    .ctx-folder.collapsed > .ctx-folder-children { display: none; }
    .ctx-file {
      display: flex; align-items: center; gap: 6px;
      padding: 3px 6px; border-radius: 5px; cursor: pointer;
      font-size: 13px; transition: background 0.1s ease-out;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ctx-file:hover { background: var(--color-surface); }
    .ctx-file.active { background: var(--color-primary-muted); color: var(--color-primary); }
    .ctx-file .tokens {
      font-size: 10px; color: var(--color-text-secondary);
      margin-left: auto; font-family: var(--font-mono); flex-shrink: 0;
    }
    .ctx-file svg { flex-shrink: 0; color: var(--color-text-secondary); }
    .ctx-file.active svg { color: var(--color-primary); }
    .ctx-viewer-header { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--color-text-secondary); font-family: var(--font-mono); margin-bottom: var(--space-4); padding-bottom: var(--space-3); border-bottom: 1px solid var(--color-border); }

    /* Activity tab */
    .timeline { max-width: 700px; }
    .timeline-day { margin-bottom: var(--space-6); }
    .timeline-day-label {
      font-size: 12px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.5px;
      color: var(--color-text-secondary);
      margin-bottom: 10px; padding-bottom: var(--space-2);
      border-bottom: 1px solid var(--color-border);
    }
    .timeline-event { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-2) 0; }
    .event-icon {
      width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; font-size: 13px;
    }
    .event-icon.commit { background: #58a6ff22; color: var(--color-primary); }
    .event-icon.spec { background: #3fb95022; color: var(--color-success); }
    .event-icon.checkpoint { background: #d2992222; color: var(--color-warning); }
    .event-icon.module { background: #bc8cff22; color: var(--color-module); }
    .event-message { font-size: 13px; line-height: 1.5; }
    .event-time {
      font-size: 11px; color: var(--color-text-secondary);
      font-family: var(--font-mono); margin-left: auto; flex-shrink: 0;
    }

    /* Modal / Slideout */
    .modal-overlay {
      display: none; position: fixed; top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(1, 4, 9, 0.6);
      z-index: 50;
    }
    .modal-overlay.show { display: block; }
    .modal {
      position: fixed; top: 0; right: 0;
      width: 60%; max-width: 700px; height: 100%;
      background: var(--color-bg);
      border-left: 1px solid var(--color-border);
      z-index: 51; overflow-y: auto;
      padding: var(--space-6) var(--space-8);
      transform: translateX(100%);
      transition: transform 0.25s ease-out;
    }
    .modal-overlay.show .modal { transform: translateX(0); }
    .modal-close {
      position: absolute; top: var(--space-4); right: var(--space-4);
      background: none; border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      width: 28px; height: 28px;
      border-radius: var(--radius-sm);
      cursor: pointer; font-size: 14px;
      display: flex; align-items: center; justify-content: center;
    }
    .modal-close:hover { border-color: var(--color-primary); color: var(--color-primary); }
    .modal-close:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }

    /* Markdown rendering */
    .md { line-height: 1.7; font-size: 15px; }
    .md h1 { font-size: 24px; font-weight: 600; margin: 20px 0 var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border); }
    .md h2 { font-size: 20px; font-weight: 600; margin: var(--space-4) 0 10px; padding-bottom: var(--space-1); border-bottom: 1px solid var(--color-border); }
    .md h3 { font-size: 16px; font-weight: 600; margin: 14px 0 var(--space-2); }
    .md p { margin: 0 0 10px; }
    .md code { background: var(--color-surface-raised); padding: 2px var(--space-2); border-radius: var(--radius-sm); font-size: 13px; font-family: var(--font-mono); }
    .md pre { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 14px; overflow-x: auto; margin: 0 0 14px; }
    .md pre code { background: none; padding: 0; font-size: 13px; line-height: 1.5; }
    .md ul, .md ol { margin: 0 0 10px; padding-left: 22px; }
    .md li { margin: 3px 0; }
    .md blockquote { border-left: 3px solid var(--color-primary); padding: var(--space-1) 14px; color: var(--color-text-secondary); margin: 0 0 10px; }
    .md table { width: 100%; border-collapse: collapse; margin: 0 0 14px; }
    .md th, .md td { border: 1px solid var(--color-border); padding: var(--space-2) 10px; text-align: left; }
    .md th { background: var(--color-surface); font-weight: 600; }

    /* Status badge */
    .badge {
      display: inline-block;
      padding: 2px var(--space-2);
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-draft { background: #7d859022; color: var(--color-text-secondary); }
    .badge-approved { background: #58a6ff22; color: var(--color-primary); }
    .badge-in-progress { background: #d2992222; color: var(--color-warning); }
    .badge-completed { background: #3fb95022; color: var(--color-success); }

    /* Empty state */
    .empty-state { text-align: center; padding: var(--space-16) var(--space-6); color: var(--color-text-secondary); }
    .empty-state h3 { font-size: 18px; color: var(--color-text-primary); margin-bottom: var(--space-2); }
    .empty-state p { font-size: 14px; max-width: 400px; margin: 0 auto var(--space-4); line-height: 1.6; }
    .empty-state code { background: var(--color-surface-raised); padding: var(--space-1) 10px; border-radius: var(--radius-sm); font-size: 13px; font-family: var(--font-mono); }

    /* Toolbar */
    .toolbar { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-5); }
    .toolbar h2 { font-size: 18px; font-weight: 600; flex: 1; }

    /* Toast */
    .toast {
      position: fixed; bottom: 20px; right: 20px;
      background: var(--color-success); color: #0d1117;
      padding: var(--space-2) var(--space-4);
      border-radius: var(--radius-md);
      font-size: 13px; font-weight: 500;
      opacity: 0; transition: opacity 0.2s ease-out;
      pointer-events: none; z-index: 60;
    }
    .toast.show { opacity: 1; }

    /* Form fields */
    .form-input {
      width: 100%;
      padding: var(--space-2) var(--space-3);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      color: var(--color-text-primary);
      font-size: 14px;
      font-family: var(--font-sans);
      outline: none;
    }
    .form-input:focus { border-color: var(--color-primary); }
    .form-label {
      font-size: 13px;
      color: var(--color-text-secondary);
      display: block;
      margin-bottom: var(--space-1);
    }
    .form-group { margin-bottom: var(--space-3); }
    .form-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }

    /* Editor textarea */
    .spec-editor {
      width: 100%;
      height: 60vh;
      background: var(--color-bg);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.6;
      resize: none;
      outline: none;
      tab-size: 2;
    }
    .spec-editor:focus { border-color: var(--color-primary); }

    /* Modal header bar */
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-4);
      padding-bottom: var(--space-3);
      border-bottom: 1px solid var(--color-border);
    }
    .modal-header-left { display: flex; align-items: center; gap: 10px; }
    .modal-header-left .path { font-size: 13px; color: var(--color-text-secondary); font-family: var(--font-mono); }
    .modal-header-right { display: flex; gap: var(--space-2); }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 3px; }
  `;
}

function getBodyHTML(projectName: string): string {
  const safeProjectName = escapeHTML(projectName);
  return `
  <div class="header">
    <div class="logo">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="M5 5.5h6M5 8h4M5 10.5h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      ${safeProjectName}
      <span class="live" title="Live reload active"></span>
    </div>
    <div class="tabs" role="tablist">
      <div class="tab active" data-tab="specs" role="tab" tabindex="0">Specs</div>
      <div class="tab" data-tab="modules" role="tab" tabindex="0">Modules</div>
      <div class="tab" data-tab="context" role="tab" tabindex="0">Context</div>
      <div class="tab" data-tab="health" role="tab" tabindex="0">Health</div>
      <div class="tab" data-tab="activity" role="tab" tabindex="0">Activity</div>
    </div>
  </div>

  <div class="main">
    <div class="tab-panel active" id="panel-specs" role="tabpanel">
      <div class="toolbar">
        <h2>Spec Board</h2>
      </div>
      <div id="specs-content"></div>
    </div>

    <div class="tab-panel" id="panel-modules" role="tabpanel">
      <div class="toolbar">
        <h2>Modules</h2>
        <button class="btn btn-primary" id="btn-sync-modules">Sync</button>
      </div>
      <div id="modules-content"></div>
    </div>

    <div class="tab-panel" id="panel-context" role="tabpanel">
      <div id="context-content"></div>
    </div>

    <div class="tab-panel" id="panel-health" role="tabpanel">
      <div class="toolbar">
        <h2>Project Health</h2>
        <button class="btn" id="btn-run-doctor">Run Doctor</button>
        <button class="btn btn-primary" id="btn-sync-health">Run Sync</button>
      </div>
      <div id="health-content"></div>
    </div>

    <div class="tab-panel" id="panel-activity" role="tabpanel">
      <div class="toolbar">
        <h2>Activity</h2>
      </div>
      <div id="activity-content"></div>
    </div>
  </div>

  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" id="modal">
      <button class="modal-close" id="modal-close-btn" aria-label="Close">&times;</button>
      <div id="modal-content"></div>
    </div>
  </div>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  `;
}

function getJS(): string {
  return `
    // ── State ──
    var expandedModule = null;
    var currentEditPath = null;

    // ── Utils ──
    function esc(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function showToast(msg) {
      var t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(function() { t.classList.remove('show'); }, 2000);
    }

    function closeModal() {
      document.getElementById('modal-overlay').classList.remove('show');
    }

    function badgeHTML(status) {
      var cls = 'badge badge-' + status;
      return '<span class="' + cls + '">' + esc(status) + '</span>';
    }

    // ── Modal events ──
    document.getElementById('modal-overlay').addEventListener('click', function(e) {
      if (e.target === e.currentTarget) closeModal();
    });

    document.getElementById('modal-close-btn').addEventListener('click', function() {
      closeModal();
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeModal();
    });

    // ── Toolbar button events ──
    document.getElementById('btn-sync-modules').addEventListener('click', function() { runSync(); });
    document.getElementById('btn-run-doctor').addEventListener('click', function() { loadHealth(); });
    document.getElementById('btn-sync-health').addEventListener('click', function() { runSync(); });

    // ── Tabs ──
    document.querySelectorAll('.tab').forEach(function(tab) {
      tab.addEventListener('click', function() { switchTab(tab); });
      tab.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab(tab); }
      });
    });

    function switchTab(tab) {
      document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'specs') loadSpecs();
      else if (tab.dataset.tab === 'modules') loadModules();
      else if (tab.dataset.tab === 'context') loadContext();
      else if (tab.dataset.tab === 'health') loadHealth();
      else if (tab.dataset.tab === 'activity') loadActivity();
    }

    // ── Event delegation ──
    // All click handlers are routed through delegation on document.body
    document.addEventListener('click', function(e) {
      var target = e.target;

      // Spec card click
      var card = target.closest('[data-spec-path]');
      if (card && !target.closest('[data-approve]') && !target.closest('[data-implement]')) {
        viewSpec(card.dataset.specPath);
        return;
      }

      // Approve button on kanban card
      var approveBtn = target.closest('[data-approve]');
      if (approveBtn) {
        e.stopPropagation();
        approveSpec(approveBtn.dataset.approve);
        return;
      }

      // Implement button on kanban card
      var implementBtn = target.closest('[data-implement]');
      if (implementBtn) {
        e.stopPropagation();
        showImplement(implementBtn.dataset.implementId, implementBtn.dataset.implement);
        return;
      }

      // Modal action: edit spec
      var editBtn = target.closest('[data-edit-spec]');
      if (editBtn) {
        editSpec(editBtn.dataset.editSpec);
        return;
      }

      // Modal action: save spec
      var saveBtn = target.closest('[data-save-spec]');
      if (saveBtn) {
        saveSpec(saveBtn.dataset.saveSpec);
        return;
      }

      // Modal action: cancel edit (return to view)
      var cancelEditBtn = target.closest('[data-cancel-edit]');
      if (cancelEditBtn) {
        viewSpec(cancelEditBtn.dataset.cancelEdit);
        return;
      }

      // Modal action: approve from modal
      var modalApproveBtn = target.closest('[data-modal-approve]');
      if (modalApproveBtn) {
        approveSpec(modalApproveBtn.dataset.modalApprove);
        return;
      }

      // Modal action: implement from modal
      var modalImplementBtn = target.closest('[data-modal-implement]');
      if (modalImplementBtn) {
        showImplement(modalImplementBtn.dataset.modalImplementId, modalImplementBtn.dataset.modalImplement);
        return;
      }

      // Create spec buttons
      var createSpecBtn = target.closest('[data-create-type]');
      if (createSpecBtn) {
        showCreateForm(createSpecBtn.dataset.createType);
        return;
      }

      // Create spec submit
      var submitCreateBtn = target.closest('[data-submit-create]');
      if (submitCreateBtn) {
        createSpec(submitCreateBtn.dataset.submitCreate);
        return;
      }

      // Cancel create
      var cancelCreateBtn = target.closest('[data-cancel-create]');
      if (cancelCreateBtn) {
        closeModal();
        return;
      }

      // Module row toggle
      var moduleRow = target.closest('[data-module-name]');
      if (moduleRow) {
        toggleModule(moduleRow.dataset.moduleName);
        return;
      }

      // Context file click
      var ctxFile = target.closest('[data-ctx-path]');
      if (ctxFile) {
        viewContextFile(ctxFile, ctxFile.dataset.ctxPath);
        return;
      }

      // Context folder toggle
      var ctxToggle = target.closest('[data-ctx-toggle]');
      if (ctxToggle) {
        ctxToggle.parentElement.classList.toggle('collapsed');
        return;
      }

      // Context view mode toggle
      var ctxMode = target.closest('[data-ctx-mode]');
      if (ctxMode) {
        ctxViewMode = ctxMode.dataset.ctxMode;
        var el = document.getElementById('context-content');
        renderContextTree(el, ctxFiles);
        return;
      }

      // Recommendation copy
      var recItem = target.closest('[data-rec]');
      if (recItem) {
        copyRec(recItem, recItem.dataset.rec);
        return;
      }
    });

    // Context search filter
    document.addEventListener('input', function(e) {
      if (e.target && e.target.id === 'ctx-search') {
        var q = e.target.value.toLowerCase();
        var items = document.querySelectorAll('.ctx-file');
        items.forEach(function(item) {
          var path = (item.dataset.ctxPath || '').toLowerCase();
          var name = item.textContent.toLowerCase();
          item.style.display = (path.includes(q) || name.includes(q)) ? '' : 'none';
        });
        // Show/hide folders based on visible children
        document.querySelectorAll('.ctx-folder').forEach(function(folder) {
          var hasVisible = false;
          folder.querySelectorAll('.ctx-file').forEach(function(f) {
            if (f.style.display !== 'none') hasVisible = true;
          });
          folder.style.display = hasVisible ? '' : 'none';
          if (q && hasVisible) folder.classList.remove('collapsed');
        });
      }
    });

    // ── Specs ──
    async function loadSpecs() {
      var res = await fetch('/api/specs');
      var data = await res.json();
      var el = document.getElementById('specs-content');

      var topBar = '<div style="display:flex;gap:8px;margin-bottom:16px">' +
        '<button class="btn btn-primary" data-create-type="spec">+ New Spec</button>' +
        '<button class="btn" data-create-type="brd">+ New BRD</button>' +
        '</div>';

      if (data.specs.length === 0) {
        el.innerHTML = topBar + '<div class="empty-state"><h3>No specs yet</h3><p>Create your first spec or BRD to start planning.</p></div>';
        return;
      }

      var cols = { draft: [], approved: [], 'in-progress': [], completed: [] };
      for (var i = 0; i < data.specs.length; i++) {
        var s = data.specs[i];
        (cols[s.status] || cols.draft).push(s);
      }

      var html = '<div class="kanban">';
      var colMeta = [
        { key: 'draft', label: 'Draft' },
        { key: 'approved', label: 'Approved' },
        { key: 'in-progress', label: 'In Progress' },
        { key: 'completed', label: 'Completed' }
      ];

      for (var ci = 0; ci < colMeta.length; ci++) {
        var col = colMeta[ci];
        var items = cols[col.key];
        html += '<div class="kanban-col"><div class="kanban-col-title">' +
          esc(col.label) + ' <span class="count">' + items.length + '</span></div>';

        for (var si = 0; si < items.length; si++) {
          var spec = items[si];
          html += '<div class="spec-card" data-spec-path="' + esc(spec.path) + '" tabindex="0">';
          html += '<div class="spec-id">#' + esc(spec.id);
          if (spec.priority) {
            html += '<span class="spec-priority">' + esc(spec.priority) + '</span>';
          }
          html += '</div>';
          html += '<div class="spec-title">' + esc(spec.title) + '</div>';
          html += '<div class="spec-branch">' + esc(spec.branch) + '</div>';

          if (spec.status === 'draft') {
            html += '<div class="spec-actions"><button class="btn btn-success" data-approve="' + esc(spec.path) + '">Approve</button></div>';
          } else if (spec.status === 'approved') {
            html += '<div class="spec-actions"><button class="btn" data-implement="' + esc(spec.branch) + '" data-implement-id="' + esc(spec.id) + '">Implement</button></div>';
          }

          html += '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
      el.innerHTML = topBar + html;
    }

    function showCreateForm(type) {
      var label = type === 'brd' ? 'Business Requirement' : 'Feature Spec';
      var mc = document.getElementById('modal-content');
      mc.innerHTML =
        '<h2 style="margin-bottom:16px">New ' + esc(label) + '</h2>' +
        '<div class="form-group">' +
          '<label class="form-label">Title</label>' +
          '<input id="create-title" type="text" class="form-input" placeholder="e.g., Add user authentication" autofocus>' +
        '</div>' +
        '<div class="form-actions">' +
          '<button class="btn" data-cancel-create>Cancel</button>' +
          '<button class="btn btn-primary" data-submit-create="' + esc(type) + '">Create</button>' +
        '</div>';
      document.getElementById('modal-overlay').classList.add('show');
      setTimeout(function() {
        var input = document.getElementById('create-title');
        if (input) input.focus();
      }, 100);
    }

    async function createSpec(type) {
      var titleEl = document.getElementById('create-title');
      var title = titleEl ? titleEl.value : '';
      if (!title) { showToast('Title required'); return; }
      try {
        var res = await fetch('/api/spec/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: type, title: title })
        });
        var data = await res.json();
        if (data.ok) {
          showToast((type === 'brd' ? 'BRD' : 'Spec') + ' #' + data.id + ' created');
          closeModal();
          loadSpecs();
        } else {
          showToast(data.error || 'Failed');
        }
      } catch (err) { showToast('Failed to create'); }
    }

    async function viewSpec(path) {
      try {
        var res = await fetch('/api/spec?path=' + encodeURIComponent(path));
        var md = await res.text();
        currentEditPath = path;

        // Parse status from frontmatter
        var statusMatch = md.match(/^---[\\s\\S]*?status:\\s*(\\w[\\w-]*)/);
        var status = statusMatch ? statusMatch[1] : 'draft';
        var idMatch = md.match(/^---[\\s\\S]*?id:\\s*"?(\\d+)"?/);
        var specId = idMatch ? idMatch[1] : '';

        // Build action buttons based on status
        var actions = '<button class="btn" data-edit-spec="' + esc(path) + '">Edit</button>';

        if (status === 'draft') {
          actions += ' <button class="btn btn-success" data-modal-approve="' + esc(path) + '">Approve</button>';
        } else if (status === 'approved') {
          actions += ' <button class="btn btn-primary" data-modal-implement="feat/' + esc(specId) + '" data-modal-implement-id="' + esc(specId) + '">Implement</button>';
        } else if (status === 'in-progress') {
          actions += ' <span style="color:var(--color-warning);font-size:12px;margin-left:8px">In Progress</span>';
        } else if (status === 'completed') {
          actions += ' <span style="color:var(--color-success);font-size:12px;margin-left:8px">Completed</span>';
        }

        var mc = document.getElementById('modal-content');
        mc.innerHTML =
          '<div class="modal-header">' +
            '<div class="modal-header-left">' +
              '<span class="path">' + esc(path) + '</span>' +
              badgeHTML(status) +
            '</div>' +
            '<div class="modal-header-right">' + actions + '</div>' +
          '</div>' +
          '<div class="md" style="max-height:60vh;overflow-y:auto">' + marked.parse(md) + '</div>';

        document.getElementById('modal-overlay').classList.add('show');
      } catch (err) {
        showToast('Could not load spec');
      }
    }

    async function editSpec(path) {
      try {
        var res = await fetch('/api/spec?path=' + encodeURIComponent(path));
        var content = await res.text();
        var mc = document.getElementById('modal-content');
        mc.innerHTML =
          '<div class="modal-header">' +
            '<div class="modal-header-left"><span class="path">' + esc(path) + '</span></div>' +
            '<div class="modal-header-right">' +
              '<button class="btn" data-cancel-edit="' + esc(path) + '">Cancel</button>' +
              '<button class="btn btn-primary" data-save-spec="' + esc(path) + '">Save</button>' +
            '</div>' +
          '</div>' +
          '<textarea id="spec-editor" class="spec-editor"></textarea>';
        document.getElementById('spec-editor').value = content;
        document.getElementById('spec-editor').addEventListener('keydown', function(e) {
          if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveSpec(path);
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            var start = e.target.selectionStart;
            e.target.value = e.target.value.substring(0, start) + '  ' + e.target.value.substring(e.target.selectionEnd);
            e.target.selectionStart = e.target.selectionEnd = start + 2;
          }
        });
      } catch (err) { showToast('Could not load spec'); }
    }

    async function saveSpec(path) {
      var editor = document.getElementById('spec-editor');
      var content = editor ? editor.value : '';
      if (!content) return;
      try {
        var res = await fetch('/api/file/save?path=' + encodeURIComponent(path), { method: 'POST', body: content });
        if (res.ok) { showToast('Saved'); viewSpec(path); loadSpecs(); }
        else { showToast('Save failed'); }
      } catch (err) { showToast('Save failed'); }
    }

    async function approveSpec(path) {
      try {
        var res = await fetch('/api/spec/approve?path=' + encodeURIComponent(path), { method: 'POST' });
        if (res.ok) {
          showToast('Spec approved');
          loadSpecs();
          viewSpec(path);
        } else {
          var data = await res.json();
          showToast(data.error || 'Failed to approve');
        }
      } catch (err) {
        showToast('Failed to approve spec');
      }
    }

    function showImplement(id, branch) {
      var mc = document.getElementById('modal-content');
      mc.innerHTML =
        '<h2 style="margin-bottom:16px">Implement Spec #' + esc(id) + '</h2>' +
        '<p style="margin-bottom:12px;color:var(--color-text-secondary)">Run these commands to start implementation:</p>' +
        '<pre style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;padding:16px;font-family:var(--font-mono);font-size:13px;line-height:1.6">' +
        'git checkout -b ' + esc(branch) + '\\n' +
        '# Start coding the spec\\n' +
        '# When done, update spec status to in-progress' +
        '</pre>';
      document.getElementById('modal-overlay').classList.add('show');
    }

    // ── Modules ──
    async function loadModules() {
      var res = await fetch('/api/modules');
      var data = await res.json();
      var el = document.getElementById('modules-content');

      if (data.modules.length === 0) {
        el.innerHTML = '<div class="empty-state"><h3>No modules found</h3><p>Modules document your codebase architecture for AI agents. Run a scan to generate them.</p><code>agentctx scan</code></div>';
        return;
      }

      var now = Date.now();
      var html = '<table class="data-table"><thead><tr><th>Name</th><th>Key Files</th><th>Exports</th><th>Last Modified</th><th>Tokens</th></tr></thead><tbody>';

      for (var i = 0; i < data.modules.length; i++) {
        var m = data.modules[i];
        var modified = new Date(m.lastModified);
        var daysAgo = Math.floor((now - modified.getTime()) / 86400000);
        var isStale = daysAgo > 7;
        var dateStr = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : daysAgo + ' days ago';

        html += '<tr data-module-name="' + esc(m.name) + '">';
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
          for (var fi = 0; fi < m.files.length; fi++) html += '<li>' + esc(m.files[fi]) + '</li>';
          html += '</ul>';
        }
        if (m.exports.length > 0) {
          html += '<h4 style="margin-top:12px">Exports</h4><ul>';
          for (var ei = 0; ei < m.exports.length; ei++) html += '<li>' + esc(m.exports[ei]) + '</li>';
          html += '</ul>';
        }
        html += '</div></td></tr>';
      }

      html += '</tbody></table>';
      el.innerHTML = html;
    }

    function toggleModule(name) {
      var detail = document.getElementById('detail-' + name);
      if (!detail) return;
      if (expandedModule === name) {
        detail.style.display = 'none';
        expandedModule = null;
      } else {
        if (expandedModule) {
          var prev = document.getElementById('detail-' + expandedModule);
          if (prev) prev.style.display = 'none';
        }
        detail.style.display = '';
        expandedModule = name;
      }
    }

    // ── Context ──
    var ctxViewMode = 'tree';
    var ctxFiles = [];

    async function loadContext() {
      var res = await fetch('/api/context');
      ctxFiles = await res.json();
      var el = document.getElementById('context-content');

      if (ctxFiles.length === 0) {
        el.innerHTML = '<div class="empty-state"><h3>No context files</h3><p>Initialize agentctx to create context files for AI agents.</p><code>agentctx init</code></div>';
        return;
      }

      renderContextTree(el, ctxFiles);
    }

    function renderContextTree(el, files) {
      // Toolbar: toggle tree/flat + search
      var toolbar = '<div class="ctx-toolbar">' +
        '<button class="ctx-toolbar-btn' + (ctxViewMode === 'tree' ? ' active' : '') + '" data-ctx-mode="tree">Tree</button>' +
        '<button class="ctx-toolbar-btn' + (ctxViewMode === 'flat' ? ' active' : '') + '" data-ctx-mode="flat">Flat</button>' +
        '</div>' +
        '<input class="ctx-search" id="ctx-search" placeholder="Filter files..." />';

      var treeHTML = '';
      if (ctxViewMode === 'tree') {
        treeHTML = buildCtxTree(files);
      } else {
        for (var i = 0; i < files.length; i++) {
          treeHTML += renderCtxFile(files[i]);
        }
      }

      el.innerHTML = '<div class="context-grid"><div class="context-tree">' + toolbar + '<div id="ctx-file-list">' + treeHTML + '</div></div><div class="context-viewer" id="ctx-viewer"><div class="empty-state"><p>Select a file to view</p></div></div></div>';
    }

    function buildCtxTree(files) {
      // Group by directory
      var tree = {};
      for (var i = 0; i < files.length; i++) {
        var parts = files[i].path.split('/');
        // Remove .agentctx/context/ prefix for display
        var displayPath = files[i].path.replace(/^\.agentctx\/context\//, '');
        var dirParts = displayPath.split('/');
        var fileName = dirParts.pop();
        var dirKey = dirParts.join('/') || 'root';
        if (!tree[dirKey]) tree[dirKey] = [];
        tree[dirKey].push({ name: fileName, path: files[i].path, tokens: files[i].tokens });
      }

      var html = '';
      var dirs = Object.keys(tree).sort();
      for (var d = 0; d < dirs.length; d++) {
        var dir = dirs[d];
        var dirFiles = tree[dir];
        if (dir === 'root') {
          for (var f = 0; f < dirFiles.length; f++) {
            html += renderCtxFile(dirFiles[f]);
          }
        } else {
          // Compact display: conventions/nextjs → "conventions / nextjs"
          var displayDir = dir.replace(/\//g, ' / ');
          html += '<div class="ctx-folder">' +
            '<div class="ctx-folder-head" data-ctx-toggle="1">' +
            '<svg class="ctx-folder-chevron" width="12" height="12" viewBox="0 0 12 12"><path d="M4.5 2L8.5 6L4.5 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '<span>' + esc(displayDir) + '</span>' +
            '<span class="tokens" style="margin-left:auto">' + dirFiles.length + '</span>' +
            '</div><div class="ctx-folder-children" style="padding-left:16px">';
          for (var f = 0; f < dirFiles.length; f++) {
            html += renderCtxFile(dirFiles[f]);
          }
          html += '</div></div>';
        }
      }
      return html;
    }

    function renderCtxFile(f) {
      var name = f.name || f.path.split('/').pop();
      return '<div class="ctx-file" data-ctx-path="' + esc(f.path) + '" tabindex="0" title="' + esc(f.path) + '">' +
        '<svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 1.5A1.5 1.5 0 014.5 0h5.379a1.5 1.5 0 011.06.44l2.122 2.12A1.5 1.5 0 0113.5 3.622V14.5a1.5 1.5 0 01-1.5 1.5h-8A1.5 1.5 0 013 14.5v-13z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 7h5M5.5 9.5h5M5.5 12h3" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>' +
        '<span>' + esc(name.replace('.md', '')) + '</span>' +
        '<span class="tokens">' + f.tokens + '</span>' +
        '</div>';
    }

    async function viewContextFile(el, path) {
      document.querySelectorAll('.ctx-file').forEach(function(f) { f.classList.remove('active'); });
      el.classList.add('active');
      try {
        var res = await fetch('/api/file?path=' + encodeURIComponent(path));
        var text = await res.text();
        var tokens = text.split(/\s+/).filter(function(w) { return w.length > 0; }).length;
        tokens = Math.ceil(tokens * 1.33);
        document.getElementById('ctx-viewer').innerHTML =
          '<div class="ctx-viewer-header"><span>' + esc(path) + '</span><span>' + tokens + ' tokens</span></div>' +
          '<div class="md">' + marked.parse(text) + '</div>';
        // Highlight code blocks
        document.querySelectorAll('#ctx-viewer pre code').forEach(function(block) { hljs.highlightElement(block); });
      } catch (err) {
        document.getElementById('ctx-viewer').innerHTML = '<div class="empty-state"><p>Could not load file</p></div>';
      }
    }

    // ── Health ──
    async function loadHealth() {
      var el = document.getElementById('health-content');
      el.innerHTML = '<div style="color:var(--color-text-secondary);padding:20px">Loading...</div>';

      var res = await fetch('/api/health');
      var data = await res.json();

      var pct = data.score / data.max;
      var circumference = 2 * Math.PI * 65;
      var offset = circumference * (1 - pct);
      var color = data.score >= 8 ? 'var(--color-success)' : data.score >= 5 ? 'var(--color-warning)' : 'var(--color-error)';

      var html = '<div class="health-grid"><div class="health-score">' +
        '<div class="score-ring"><svg width="160" height="160" viewBox="0 0 160 160">' +
        '<circle class="bg" cx="80" cy="80" r="65"/>' +
        '<circle class="fg" cx="80" cy="80" r="65" stroke="' + color + '" stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '"/>' +
        '</svg><div class="score-number" style="color:' + color + '">' + data.score + '</div></div>' +
        '<div class="score-label">out of ' + data.max + '</div>' +
        '</div><div class="health-checks">';

      for (var i = 0; i < data.checks.length; i++) {
        var c = data.checks[i];
        html += '<div class="check-item">' +
          '<div class="check-icon ' + (c.pass ? 'pass' : 'fail') + '">' + (c.pass ? '\\u2713' : '\\u2717') + '</div>' +
          '<span>' + esc(c.label) + '</span>' +
          (c.detail ? '<span class="check-detail">' + esc(c.detail) + '</span>' : '') +
          '</div>';
      }

      html += '</div></div>';

      if (data.recommendations.length > 0) {
        html += '<div class="recommendations"><h3>Recommendations</h3>';
        for (var ri = 0; ri < data.recommendations.length; ri++) {
          var r = data.recommendations[ri];
          html += '<div class="rec-item" data-rec="' + esc(r) + '">' + esc(r) + '</div>';
        }
        html += '</div>';
      }

      el.innerHTML = html;
    }

    function copyRec(el, text) {
      navigator.clipboard.writeText(text).then(function() {
        el.classList.add('copied');
        setTimeout(function() { el.classList.remove('copied'); }, 1500);
      });
    }

    // ── Activity ──
    async function loadActivity() {
      var res = await fetch('/api/activity');
      var data = await res.json();
      var el = document.getElementById('activity-content');

      if (data.events.length === 0) {
        el.innerHTML = '<div class="empty-state"><h3>No activity yet</h3><p>Activity is derived from your git history. Make some commits to see them here.</p></div>';
        return;
      }

      var iconMap = {
        commit: '\\u2022',
        spec: '\\u2606',
        checkpoint: '\\u2691',
        module: '\\u25CB'
      };

      // Group by date
      var groups = {};
      var groupOrder = [];
      for (var i = 0; i < data.events.length; i++) {
        var ev = data.events[i];
        if (!groups[ev.date]) {
          groups[ev.date] = [];
          groupOrder.push(ev.date);
        }
        groups[ev.date].push(ev);
      }

      var html = '<div class="timeline">';
      for (var gi = 0; gi < groupOrder.length; gi++) {
        var date = groupOrder[gi];
        var events = groups[date];
        html += '<div class="timeline-day"><div class="timeline-day-label">' + esc(date) + '</div>';
        for (var ei = 0; ei < events.length; ei++) {
          var ev2 = events[ei];
          html += '<div class="timeline-event">' +
            '<div class="event-icon ' + esc(ev2.type) + '">' + (iconMap[ev2.type] || '\\u2022') + '</div>' +
            '<div class="event-message">' + esc(ev2.message) + '</div>' +
            '<div class="event-time">' + esc(ev2.time) + '</div>' +
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
        var res = await fetch('/api/sync', { method: 'POST' });
        if (res.ok) showToast('Sync started');
        else showToast('Sync failed to start');
      } catch (err) {
        showToast('Sync failed');
      }
    }

    // ── SSE live reload ──
    var es = new EventSource('/api/events');
    es.onmessage = function() {
      var activeTab = document.querySelector('.tab.active');
      if (activeTab) switchTab(activeTab);
    };

    // ── Init: load first tab ──
    loadSpecs();
  `;
}

function getDashboardHTML(projectName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(projectName)} — Dashboard</title>
  <style>${getCSS()}</style>
</head>
<body>
  ${getBodyHTML(projectName)}
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"></script>
  <script>${getJS()}</script>
</body>
</html>`;
}

// ── Server ─────────────────────────────────────────────────────────────

function openBrowser(url: string): void {
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} ${url}`);
}

async function handleAPIRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  projectRoot: string,
): Promise<boolean> {
  // SSE endpoint
  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.write('data: {"type":"connected"}\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return true;
  }

  // API: Specs list
  if (url.pathname === '/api/specs') {
    const data = await getSpecs(projectRoot);
    jsonResponse(res, data);
    return true;
  }

  // API: Modules list
  if (url.pathname === '/api/modules') {
    const data = await getModules(projectRoot);
    jsonResponse(res, data);
    return true;
  }

  // API: Health
  if (url.pathname === '/api/health') {
    const data = await getHealth(projectRoot);
    jsonResponse(res, data);
    return true;
  }

  // API: Activity
  if (url.pathname === '/api/activity') {
    const data = await getActivity(projectRoot);
    jsonResponse(res, data);
    return true;
  }

  // API: Context files list
  if (url.pathname === '/api/context') {
    const files = await getContextFiles(projectRoot);
    jsonResponse(res, files);
    return true;
  }

  // API: Read a specific file (for context viewer and spec viewer)
  if (url.pathname === '/api/file') {
    const filePath = url.searchParams.get('path');
    if (!filePath) { res.writeHead(400); res.end('Missing path'); return true; }
    const resolved = join(projectRoot, filePath);
    if (!resolved.startsWith(projectRoot)) { res.writeHead(403); res.end('Forbidden'); return true; }
    try {
      const content = await readFile(resolved, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(content);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
    return true;
  }

  // API: Read spec
  if (url.pathname === '/api/spec' && req.method === 'GET') {
    const specPath = url.searchParams.get('path');
    if (!specPath) { res.writeHead(400); res.end('Missing path'); return true; }
    const resolved = join(projectRoot, specPath);
    if (!resolved.startsWith(projectRoot)) { res.writeHead(403); res.end('Forbidden'); return true; }
    try {
      const content = await readFile(resolved, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(content);
    } catch {
      res.writeHead(404); res.end('Spec not found');
    }
    return true;
  }

  // API: Approve spec (frontmatter-based, no file rename)
  if (url.pathname === '/api/spec/approve' && req.method === 'POST') {
    const specPath = url.searchParams.get('path');
    if (!specPath) { jsonResponse(res, { error: 'Missing path' }, 400); return true; }
    const resolved = join(projectRoot, specPath);
    if (!resolved.startsWith(projectRoot)) { jsonResponse(res, { error: 'Forbidden' }, 403); return true; }

    try {
      const content = await readFile(resolved, 'utf-8');
      const fm = parseFrontmatter(content);

      if (fm.status !== 'draft') {
        jsonResponse(res, { error: `Only draft specs can be approved (current status: ${fm.status || 'unknown'})` }, 400);
        return true;
      }

      const today = new Date().toISOString().split('T')[0];
      let updated = content;
      updated = updated.replace(/^(status:\s*)draft/m, '$1approved');
      updated = updated.replace(/^(updated:\s*)\S+/m, `$1${today}`);
      const historyEntry = `  - status: approved\n    date: ${today}`;
      updated = updated.replace(/(history:\n(?:[\s\S]*?))(\n---)/m, `$1\n${historyEntry}$2`);

      await writeFile(resolved, updated, 'utf-8');

      // Update INDEX.md
      const indexPath = join(projectRoot, '.agentctx', 'specs', 'INDEX.md');
      if (existsSync(indexPath)) {
        try {
          let index = await readFile(indexPath, 'utf-8');
          const specId = fm.id;
          if (specId) {
            index = index.replace(
              new RegExp(`(\\|\\s*${specId}\\s*\\|[^|]*\\|\\s*)draft(\\s*\\|)`),
              `$1approved$2`,
            );
            await writeFile(indexPath, index, 'utf-8');
          }
        } catch { /* ignore index update failure */ }
      }

      jsonResponse(res, { ok: true, path: specPath });
    } catch (err) {
      jsonResponse(res, { error: String(err) }, 500);
    }
    return true;
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
    return true;
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
    return true;
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

        let maxId = 0;
        try {
          const files = await readdir(specsDir);
          for (const f of files) {
            const match = f.match(/^(?:\d{4})-/) ? f.match(/^(\d{4})-/) : f.match(/(?:draft|approved|in-progress|completed)-(?:BRD-)?(\d+)/);
            if (match) {
              const idNum = parseInt(match[1] || match[2]);
              if (!isNaN(idNum)) maxId = Math.max(maxId, idNum);
            }
          }
        } catch { /* empty dir */ }
        const nextId = String(maxId + 1).padStart(4, '0');

        const kebab = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const filename = `${nextId}-${kebab}.md`;
        const today = new Date().toISOString().split('T')[0];

        const isBrd = type === 'brd';
        const templateName = isBrd ? 'brd-template.md' : 'feature-spec.md';
        const templatePath = join(templatesDir, templateName);
        let content: string;
        try {
          content = await readFile(templatePath, 'utf-8');
          content = content.replace(/NNNN/g, nextId).replace(/\{Title\}|Feature Title|BRD Title/g, title).replace(/YYYY-MM-DD/g, today);
        } catch {
          content = `---\nid: "${nextId}"\ntitle: "${title}"\nstatus: draft\ncreated: ${today}\nupdated: ${today}\npriority: P2\nhistory:\n  - status: draft\n    date: ${today}\n---\n\n# ${title}\n\n## Description\n\n## Acceptance Criteria\n- [ ] \n`;
        }

        await writeFile(join(specsDir, filename), content, 'utf-8');

        const indexPath = join(specsDir, 'INDEX.md');
        try {
          let index = await readFile(indexPath, 'utf-8');
          index += `| ${nextId} | ${title} | draft | P2 | — | ${today} |\n`;
          await writeFile(indexPath, index, 'utf-8');
        } catch { /* no index */ }

        jsonResponse(res, { ok: true, path: `.agentctx/specs/${filename}`, id: nextId });
      } catch (err) {
        jsonResponse(res, { error: String(err) }, 500);
      }
    });
    return true;
  }

  // API: Save file (edit spec or module)
  if (url.pathname === '/api/file/save' && req.method === 'POST') {
    const filePath = url.searchParams.get('path');
    if (!filePath) { jsonResponse(res, { error: 'Missing path' }, 400); return true; }
    const resolved = join(projectRoot, filePath);
    if (!resolved.startsWith(projectRoot)) { jsonResponse(res, { error: 'Forbidden' }, 403); return true; }

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
    return true;
  }

  return false;
}

// ── Main command ───────────────────────────────────────────────────────

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
      const handled = await handleAPIRequest(req, res, url, projectRoot);
      if (handled) return;

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
