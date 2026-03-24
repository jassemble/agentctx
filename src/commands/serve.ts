import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { logger } from '../utils/logger.js';

interface ServeOptions {
  port: string;
  open?: boolean;
}

interface FileInfo {
  path: string;
  size: number;
  lastModified: Date;
}

interface LintBadge {
  file: string;
  tokens: number;
  budget: number | null;
  isOutput: boolean;
  inSync: boolean | null;
  stale: boolean;
}

// --- File Discovery ---

async function findMarkdownFiles(dir: string, base: string = dir): Promise<FileInfo[]> {
  const files: FileInfo[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', '.next', '__pycache__'].includes(entry.name)) continue;
      files.push(...await findMarkdownFiles(fullPath, base));
    } else if (extname(entry.name).toLowerCase() === '.md') {
      const s = await stat(fullPath);
      files.push({
        path: relative(base, fullPath),
        size: s.size,
        lastModified: s.mtime,
      });
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// --- Lint Badges ---

async function getLintBadges(projectRoot: string): Promise<LintBadge[]> {
  const badges: LintBadge[] = [];

  try {
    const { findConfigPath, loadConfig } = await import('../core/config.js');
    const { loadContextModules } = await import('../core/context.js');
    const { runGenerators } = await import('../generators/index.js');
    const { estimateTokens } = await import('../utils/tokens.js');

    const configPath = findConfigPath(projectRoot);
    if (!configPath) return badges;

    const config = await loadConfig(configPath);
    const agentctxDir = dirname(configPath);
    const modules = await loadContextModules(config, agentctxDir);
    const results = await runGenerators(modules, config);

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // Context module badges
    for (const mod of modules) {
      const relPath = config.context.find(c => c.endsWith(mod.filename));
      if (relPath) {
        badges.push({
          file: '.agentctx/' + relPath,
          tokens: estimateTokens(mod.content),
          budget: null,
          isOutput: false,
          inSync: null,
          stale: mod.lastModified.getTime() < thirtyDaysAgo,
        });
      }
    }

    // Output badges
    for (const gen of results) {
      let inSync: boolean | null = null;
      try {
        const existing = await readFile(join(projectRoot, gen.path), 'utf-8');
        inSync = existing === gen.content;
      } catch { inSync = false; }

      badges.push({
        file: gen.path,
        tokens: gen.tokenCount,
        budget: gen.tokenBudget,
        isOutput: true,
        inSync,
        stale: false,
      });
    }
  } catch { /* no agentctx config, skip badges */ }

  return badges;
}

// --- Full-Text Search ---

async function searchFiles(projectRoot: string, files: FileInfo[], query: string): Promise<{ path: string; matches: { line: number; text: string }[] }[]> {
  const results: { path: string; matches: { line: number; text: string }[] }[] = [];
  const q = query.toLowerCase();

  for (const file of files) {
    try {
      const content = await readFile(join(projectRoot, file.path), 'utf-8');
      const lines = content.split('\n');
      const matches: { line: number; text: string }[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(q)) {
          matches.push({ line: i + 1, text: lines[i].trim().slice(0, 200) });
        }
      }

      if (matches.length > 0) {
        results.push({ path: file.path, matches: matches.slice(0, 5) });
      }
    } catch { /* skip unreadable files */ }
  }

  return results;
}

// --- SSE for Live Reload ---

const sseClients = new Set<ServerResponse>();

function broadcastReload(changedFile: string): void {
  const data = `data: ${JSON.stringify({ type: 'reload', file: changedFile })}\n\n`;
  for (const client of sseClients) {
    client.write(data);
  }
}

function setupFileWatcher(projectRoot: string): void {
  const watchDirs = new Set<string>();

  function addWatch(dir: string): void {
    if (watchDirs.has(dir)) return;
    watchDirs.add(dir);

    try {
      watch(dir, { recursive: true }, (eventType, filename) => {
        if (filename && extname(filename).toLowerCase() === '.md') {
          broadcastReload(filename);
        }
      });
    } catch {
      // Fallback: non-recursive watch for platforms that don't support it
      watch(dir, (eventType, filename) => {
        if (filename && extname(filename).toLowerCase() === '.md') {
          broadcastReload(filename);
        }
      });
    }
  }

  addWatch(projectRoot);
}

// --- HTML Template ---

function categorizeFiles(files: FileInfo[]): Map<string, FileInfo[]> {
  const categories = new Map<string, FileInfo[]>();

  for (const file of files) {
    const parts = file.path.split('/');
    const category = parts.length > 1 ? parts.slice(0, -1).join('/') : 'Root';
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category)!.push(file);
  }

  return categories;
}

function escapeHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getHTML(files: FileInfo[], projectName: string, badges: LintBadge[]): string {
  const categories = categorizeFiles(files);
  const badgeMap = new Map(badges.map(b => [b.file, b]));

  let sidebarHTML = '';
  for (const [category, categoryFiles] of categories) {
    sidebarHTML += `<div class="category">
      <div class="category-title">${escapeHTML(category)}</div>
      ${categoryFiles.map(f => {
        const name = f.path.split('/').pop()!;
        const badge = badgeMap.get(f.path);
        let badgeHTML = '';
        if (badge) {
          if (badge.isOutput && badge.inSync === false) {
            badgeHTML += '<span class="file-badge drift">drift</span>';
          }
          if (badge.budget && badge.tokens > badge.budget) {
            badgeHTML += '<span class="file-badge over-budget">over budget</span>';
          } else if (badge.budget) {
            const pct = Math.round((badge.tokens / badge.budget) * 100);
            badgeHTML += `<span class="file-badge tokens">${pct}%</span>`;
          }
          if (badge.stale) {
            badgeHTML += '<span class="file-badge stale">stale</span>';
          }
          if (badge.isOutput && badge.inSync === true) {
            badgeHTML += '<span class="file-badge synced">synced</span>';
          }
        }
        return `<a class="file-link" href="#" data-path="${escapeHTML(f.path)}" title="${escapeHTML(f.path)}">
          <span class="file-name">${escapeHTML(name)}</span>
          <span class="file-badges">${badgeHTML}</span>
        </a>`;
      }).join('\n')}
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(projectName)} — agentctx</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --surface-2: #1c2333;
      --border: #30363d;
      --text: #e6edf3;
      --text-dim: #7d8590;
      --accent: #58a6ff;
      --accent-dim: #1f6feb33;
      --green: #3fb950;
      --yellow: #d29922;
      --red: #f85149;
      --sidebar-w: 300px;
      --toc-w: 220px;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

    /* Sidebar */
    .sidebar {
      width: var(--sidebar-w);
      min-width: var(--sidebar-w);
      background: var(--surface);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-header {
      padding: 20px 16px 12px;
      border-bottom: 1px solid var(--border);
    }

    .sidebar-header h1 {
      font-size: 16px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 4px;
    }

    .sidebar-header .badge {
      font-size: 11px;
      color: var(--text-dim);
      background: var(--accent-dim);
      padding: 2px 8px;
      border-radius: 10px;
      display: inline-block;
    }

    .sidebar-search {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
    }

    .search-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 8px;
    }

    .search-tab {
      flex: 1;
      padding: 4px 8px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text-dim);
      font-size: 11px;
      cursor: pointer;
      text-align: center;
    }

    .search-tab.active {
      background: var(--accent-dim);
      border-color: var(--accent);
      color: var(--accent);
    }

    .sidebar-search input {
      width: 100%;
      padding: 6px 10px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 13px;
      outline: none;
    }

    .sidebar-search input:focus { border-color: var(--accent); }

    .sidebar-files {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .category { margin-bottom: 4px; }

    .category-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
      padding: 8px 16px 4px;
    }

    .file-link {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 12px 5px 24px;
      color: var(--text);
      text-decoration: none;
      font-size: 13px;
      border-left: 2px solid transparent;
      transition: all 0.15s;
      gap: 6px;
    }

    .file-name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }

    .file-badges { display: flex; gap: 3px; flex-shrink: 0; }

    .file-badge {
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 8px;
      font-weight: 600;
      white-space: nowrap;
    }

    .file-badge.tokens { background: var(--accent-dim); color: var(--accent); }
    .file-badge.synced { background: #3fb95022; color: var(--green); }
    .file-badge.drift { background: #d2992222; color: var(--yellow); }
    .file-badge.over-budget { background: #f8514922; color: var(--red); }
    .file-badge.stale { background: #d2992222; color: var(--yellow); }

    .file-link:hover { background: var(--surface-2); color: var(--accent); }

    .file-link.active {
      background: var(--accent-dim);
      color: var(--accent);
      border-left-color: var(--accent);
    }

    /* Search Results */
    .search-results { padding: 8px 0; }

    .search-result {
      padding: 6px 16px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .search-result:hover { background: var(--surface-2); }

    .search-result-file {
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      margin-bottom: 2px;
    }

    .search-result-line {
      font-size: 11px;
      color: var(--text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .search-result-line .line-num {
      color: var(--text-dim);
      margin-right: 4px;
      font-family: monospace;
    }

    .search-highlight {
      background: #d2992244;
      color: var(--yellow);
      border-radius: 2px;
      padding: 0 1px;
    }

    /* Content area */
    .content-wrapper {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 32px 48px;
    }

    .content-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    .content-header .filepath {
      font-size: 14px;
      color: var(--text-dim);
      font-family: 'SF Mono', 'Fira Code', monospace;
    }

    .content-meta {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: var(--text-dim);
    }

    .content-meta span { display: flex; align-items: center; gap: 4px; }

    /* Table of Contents */
    .toc {
      width: var(--toc-w);
      min-width: var(--toc-w);
      border-left: 1px solid var(--border);
      padding: 24px 16px;
      overflow-y: auto;
      background: var(--surface);
    }

    .toc-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
      margin-bottom: 12px;
    }

    .toc-link {
      display: block;
      font-size: 12px;
      color: var(--text-dim);
      text-decoration: none;
      padding: 3px 0 3px 0;
      transition: color 0.15s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .toc-link:hover { color: var(--accent); }
    .toc-link.active { color: var(--accent); font-weight: 500; }
    .toc-link.depth-2 { padding-left: 0; }
    .toc-link.depth-3 { padding-left: 12px; font-size: 11px; }
    .toc-link.depth-4 { padding-left: 24px; font-size: 11px; }

    .toc-empty {
      font-size: 12px;
      color: var(--text-dim);
      font-style: italic;
    }

    /* Welcome */
    .welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 60vh;
      color: var(--text-dim);
      text-align: center;
    }

    .welcome h2 { font-size: 24px; margin-bottom: 8px; color: var(--text); }
    .welcome p { font-size: 14px; margin-bottom: 4px; }
    .welcome kbd {
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
    }

    /* Live reload indicator */
    .live-dot {
      width: 6px;
      height: 6px;
      background: var(--green);
      border-radius: 50%;
      display: inline-block;
      margin-left: 6px;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    /* Markdown rendered content */
    .markdown-body { line-height: 1.7; font-size: 15px; }
    .markdown-body h1 { font-size: 28px; font-weight: 600; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
    .markdown-body h2 { font-size: 22px; font-weight: 600; margin: 20px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
    .markdown-body h3 { font-size: 18px; font-weight: 600; margin: 16px 0 8px; }
    .markdown-body h4 { font-size: 15px; font-weight: 600; margin: 12px 0 8px; }
    .markdown-body p { margin: 0 0 12px; }
    .markdown-body a { color: var(--accent); text-decoration: none; }
    .markdown-body a:hover { text-decoration: underline; }
    .markdown-body code { background: var(--surface-2); padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: 'SF Mono', 'Fira Code', monospace; }
    .markdown-body pre { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; overflow-x: auto; margin: 0 0 16px; position: relative; }
    .markdown-body pre code { background: none; padding: 0; font-size: 13px; line-height: 1.5; }
    .markdown-body ul, .markdown-body ol { margin: 0 0 12px; padding-left: 24px; }
    .markdown-body li { margin: 4px 0; }
    .markdown-body blockquote { border-left: 3px solid var(--accent); padding: 4px 16px; color: var(--text-dim); margin: 0 0 12px; }
    .markdown-body table { width: 100%; border-collapse: collapse; margin: 0 0 16px; }
    .markdown-body th, .markdown-body td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
    .markdown-body th { background: var(--surface); font-weight: 600; }
    .markdown-body tr:nth-child(even) { background: var(--surface-2); }
    .markdown-body hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
    .markdown-body img { max-width: 100%; border-radius: 8px; }

    /* Mermaid */
    .mermaid { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin: 0 0 16px; text-align: center; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }

    /* Mobile */
    @media (max-width: 768px) {
      .sidebar { width: 100%; position: fixed; z-index: 10; transform: translateX(-100%); transition: transform 0.2s; }
      .sidebar.open { transform: translateX(0); }
      .content { padding: 16px; }
      .toc { display: none; }
      .menu-toggle { display: block !important; }
    }

    .menu-toggle {
      display: none; position: fixed; top: 12px; left: 12px; z-index: 20;
      background: var(--surface); border: 1px solid var(--border);
      color: var(--text); padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 16px;
    }
  </style>
</head>
<body>
  <button class="menu-toggle" onclick="document.querySelector('.sidebar').classList.toggle('open')">&#9776;</button>

  <aside class="sidebar">
    <div class="sidebar-header">
      <h1>${escapeHTML(projectName)} <span class="live-dot" title="Live reload active"></span></h1>
      <span class="badge">${files.length} markdown files</span>
    </div>
    <div class="sidebar-search">
      <div class="search-tabs">
        <button class="search-tab active" data-mode="filter">Filter</button>
        <button class="search-tab" data-mode="search">Search Content</button>
      </div>
      <input type="text" id="search" placeholder="Filter files..." autocomplete="off">
    </div>
    <nav class="sidebar-files" id="file-list">
      ${sidebarHTML}
    </nav>
    <div class="search-results" id="search-results" style="display:none"></div>
  </aside>

  <div class="content-wrapper">
    <main class="content" id="content">
      <div class="welcome">
        <h2>agentctx</h2>
        <p>Select a markdown file from the sidebar to view it.</p>
        <p>Use <kbd>Ctrl+K</kbd> to focus search</p>
      </div>
    </main>
    <aside class="toc" id="toc">
      <div class="toc-title">On this page</div>
      <div id="toc-links" class="toc-empty">No file selected</div>
    </aside>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <script>
    // --- Init libraries ---
    marked.setOptions({
      highlight: function(code, lang) {
        if (lang === 'mermaid') return code; // handled separately
        if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
        return hljs.highlightAuto(code).value;
      },
      breaks: true,
      gfm: true,
    });

    mermaid.initialize({ startOnLoad: false, theme: 'dark', themeVariables: {
      darkMode: true, background: '#161b22', primaryColor: '#1f6feb',
      primaryTextColor: '#e6edf3', lineColor: '#30363d',
    }});

    const contentEl = document.getElementById('content');
    const tocLinks = document.getElementById('toc-links');
    const links = document.querySelectorAll('.file-link');
    const searchInput = document.getElementById('search');
    const fileList = document.getElementById('file-list');
    const searchResults = document.getElementById('search-results');
    const searchTabs = document.querySelectorAll('.search-tab');
    let currentFile = null;
    let searchMode = 'filter';

    // --- Search Tab Toggle ---
    searchTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        searchTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        searchMode = tab.dataset.mode;
        searchInput.placeholder = searchMode === 'filter' ? 'Filter files...' : 'Search all content...';
        searchInput.value = '';
        searchResults.style.display = 'none';
        fileList.style.display = '';
        // Reset filter
        links.forEach(l => l.style.display = '');
        document.querySelectorAll('.category').forEach(c => c.style.display = '');
      });
    });

    // --- File Loading ---
    async function loadFile(path) {
      currentFile = path;
      const res = await fetch('/api/file?path=' + encodeURIComponent(path));
      const text = await res.text();
      const html = marked.parse(text);

      // Count words for token estimate
      const words = text.split(/\\s+/).filter(w => w.length > 0).length;
      const tokens = Math.ceil(words * 1.33);

      contentEl.innerHTML = \`
        <div class="content-header">
          <span class="filepath">\${path}</span>
          <div class="content-meta">
            <span>\${tokens.toLocaleString()} tokens</span>
            <span>\${words.toLocaleString()} words</span>
          </div>
        </div>
        <div class="markdown-body">\${html}</div>
      \`;

      // Highlight code blocks
      contentEl.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));

      // Render mermaid diagrams
      contentEl.querySelectorAll('code.language-mermaid').forEach(async (el, i) => {
        const pre = el.parentElement;
        const div = document.createElement('div');
        div.className = 'mermaid';
        try {
          const { svg } = await mermaid.render('mermaid-' + Date.now() + '-' + i, el.textContent);
          div.innerHTML = svg;
        } catch(e) {
          div.textContent = 'Mermaid render error: ' + e.message;
        }
        pre.replaceWith(div);
      });

      contentEl.scrollTop = 0;

      // Update active link
      links.forEach(l => l.classList.remove('active'));
      document.querySelector(\`[data-path="\${CSS.escape(path)}"]\`)?.classList.add('active');

      history.replaceState(null, '', '#' + encodeURIComponent(path));
      document.querySelector('.sidebar').classList.remove('open');

      // Build TOC
      buildTOC();
    }

    // --- Table of Contents ---
    function buildTOC() {
      const headings = contentEl.querySelectorAll('.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4');

      if (headings.length === 0) {
        tocLinks.innerHTML = '<div class="toc-empty">No headings found</div>';
        return;
      }

      let html = '';
      headings.forEach((h, i) => {
        const id = 'heading-' + i;
        h.id = id;
        const depth = parseInt(h.tagName[1]);
        const text = h.textContent.slice(0, 60);
        html += \`<a class="toc-link depth-\${depth}" href="#\${id}" data-id="\${id}">\${text}</a>\`;
      });

      tocLinks.innerHTML = html;

      // Click handler
      tocLinks.querySelectorAll('.toc-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const el = document.getElementById(link.dataset.id);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            tocLinks.querySelectorAll('.toc-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
          }
        });
      });

      // Scroll spy
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            tocLinks.querySelectorAll('.toc-link').forEach(l => l.classList.remove('active'));
            const link = tocLinks.querySelector(\`[data-id="\${entry.target.id}"]\`);
            if (link) link.classList.add('active');
          }
        });
      }, { rootMargin: '-20% 0px -60% 0px' });

      headings.forEach(h => observer.observe(h));
    }

    // --- File Link Handlers ---
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        loadFile(link.dataset.path);
      });
    });

    // --- Search ---
    let searchTimeout = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const q = searchInput.value;

      if (searchMode === 'filter') {
        // Filter files
        searchResults.style.display = 'none';
        fileList.style.display = '';
        links.forEach(link => {
          const match = link.dataset.path.toLowerCase().includes(q.toLowerCase());
          link.style.display = match ? '' : 'none';
        });
        document.querySelectorAll('.category').forEach(cat => {
          const anyVisible = Array.from(cat.querySelectorAll('.file-link')).some(l => l.style.display !== 'none');
          cat.style.display = anyVisible ? '' : 'none';
        });
      } else {
        // Full-text search (debounced)
        if (q.length < 2) {
          searchResults.style.display = 'none';
          fileList.style.display = '';
          return;
        }
        searchTimeout = setTimeout(async () => {
          const res = await fetch('/api/search?q=' + encodeURIComponent(q));
          const results = await res.json();

          fileList.style.display = 'none';
          searchResults.style.display = '';

          if (results.length === 0) {
            searchResults.innerHTML = '<div style="padding:16px;color:var(--text-dim);font-size:13px">No results found</div>';
            return;
          }

          searchResults.innerHTML = results.map(r =>
            \`<div class="search-result" data-path="\${r.path}">
              <div class="search-result-file">\${r.path}</div>
              \${r.matches.map(m =>
                \`<div class="search-result-line"><span class="line-num">L\${m.line}</span>\${highlightMatch(m.text, q)}</div>\`
              ).join('')}
            </div>\`
          ).join('');

          searchResults.querySelectorAll('.search-result').forEach(el => {
            el.addEventListener('click', () => loadFile(el.dataset.path));
          });
        }, 300);
      }
    });

    function highlightMatch(text, query) {
      const escaped = query.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
      const re = new RegExp('(' + escaped + ')', 'gi');
      return escapeHTMLClient(text).replace(re, '<span class="search-highlight">$1</span>');
    }

    function escapeHTMLClient(str) {
      return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    // --- Keyboard Shortcuts ---
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });

    // --- Live Reload via SSE ---
    const evtSource = new EventSource('/api/events');
    evtSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'reload' && currentFile) {
        loadFile(currentFile);
      }
    };

    // --- Init ---
    if (location.hash) {
      loadFile(decodeURIComponent(location.hash.slice(1)));
    } else if (links.length > 0) {
      loadFile(links[0].dataset.path);
    }
  </script>
</body>
</html>`;
}

function openBrowser(url: string): void {
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} ${url}`);
}

// --- Server ---

export async function serveCommand(options: ServeOptions): Promise<void> {
  const projectRoot = process.cwd();
  const port = parseInt(options.port, 10);

  logger.info('Scanning for markdown files...');
  const files = await findMarkdownFiles(projectRoot);

  if (files.length === 0) {
    logger.error('No markdown files found in the current directory.');
    process.exit(1);
  }

  logger.success(`Found ${files.length} markdown files`);

  // Detect project name
  let projectName = projectRoot.split('/').pop() || 'Project';
  try {
    const { findConfigPath, loadConfig } = await import('../core/config.js');
    const configPath = findConfigPath(projectRoot);
    if (configPath) {
      const config = await loadConfig(configPath);
      projectName = config.project.name;
    }
  } catch { /* use directory name */ }

  // Get lint badges
  const badges = await getLintBadges(projectRoot);
  const html = getHTML(files, projectName, badges);

  // Setup file watcher for live reload
  setupFileWatcher(projectRoot);
  logger.success('File watcher active — live reload enabled');

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    // SSE endpoint for live reload
    if (url.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write('data: {"type":"connected"}\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // File content endpoint
    if (url.pathname === '/api/file') {
      const filePath = url.searchParams.get('path');
      if (!filePath) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing path parameter');
        return;
      }

      const resolved = join(projectRoot, filePath);
      if (!resolved.startsWith(projectRoot)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      try {
        const content = await readFile(resolved, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(content);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
      }
      return;
    }

    // Full-text search endpoint
    if (url.pathname === '/api/search') {
      const query = url.searchParams.get('q') || '';
      if (query.length < 2) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('[]');
        return;
      }

      const results = await searchFiles(projectRoot, files, query);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(results));
      return;
    }

    // Lint badges endpoint (for dynamic refresh)
    if (url.pathname === '/api/lint') {
      const freshBadges = await getLintBadges(projectRoot);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(freshBadges));
      return;
    }

    // Serve the SPA
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(html);
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    logger.success(`Serving at ${url}`);
    logger.dim(`${files.length} markdown files from ${projectRoot}`);
    if (badges.length > 0) logger.dim(`${badges.length} lint badges active`);
    logger.dim('Press Ctrl+C to stop\n');

    if (options.open !== false) {
      openBrowser(url);
    }
  });
}
