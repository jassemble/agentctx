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

async function findMarkdownFiles(dir: string, base: string = dir): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', '.next', '__pycache__'].includes(entry.name)) continue;
      files.push(...await findMarkdownFiles(fullPath, base));
    } else if (extname(entry.name).toLowerCase() === '.md') {
      files.push(relative(base, fullPath));
    }
  }

  return files.sort();
}

function categorizeFiles(files: string[]): Map<string, string[]> {
  const categories = new Map<string, string[]>();
  for (const file of files) {
    const parts = file.split('/');
    const category = parts.length > 1 ? parts.slice(0, -1).join('/') : 'Root';
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category)!.push(file);
  }
  return categories;
}

function escapeHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// SSE live reload
const sseClients = new Set<ServerResponse>();

function broadcastReload(changedFile: string): void {
  const data = `data: ${JSON.stringify({ type: 'reload', file: changedFile })}\n\n`;
  for (const client of sseClients) {
    client.write(data);
  }
}

function setupFileWatcher(projectRoot: string): void {
  try {
    watch(projectRoot, { recursive: true }, (_eventType, filename) => {
      if (filename && extname(filename).toLowerCase() === '.md') {
        broadcastReload(filename);
      }
    });
  } catch {
    watch(projectRoot, (_eventType, filename) => {
      if (filename && extname(filename).toLowerCase() === '.md') {
        broadcastReload(filename);
      }
    });
  }
}

function getHTML(files: string[], projectName: string): string {
  const categories = categorizeFiles(files);

  let sidebarHTML = '';
  for (const [category, categoryFiles] of categories) {
    sidebarHTML += `<div class="category">
      <div class="category-title">${escapeHTML(category)}</div>
      ${categoryFiles.map(f => {
        const name = f.split('/').pop()!;
        return `<a class="file-link" href="#" data-path="${escapeHTML(f)}" title="${escapeHTML(f)}">${escapeHTML(name)}</a>`;
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
      --bg: #0d1117; --surface: #161b22; --surface-2: #1c2333;
      --border: #30363d; --text: #e6edf3; --text-dim: #7d8590;
      --accent: #58a6ff; --accent-dim: #1f6feb33; --green: #3fb950;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); display: flex; height: 100vh; overflow: hidden; }

    /* Sidebar */
    .sidebar { width: 260px; min-width: 260px; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
    .sidebar-header { padding: 20px 16px 12px; border-bottom: 1px solid var(--border); }
    .sidebar-header h1 { font-size: 15px; font-weight: 600; }
    .sidebar-header .sub { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
    .sidebar-search { padding: 10px 16px; border-bottom: 1px solid var(--border); }
    .sidebar-search input { width: 100%; padding: 6px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 13px; outline: none; }
    .sidebar-search input:focus { border-color: var(--accent); }
    .sidebar-files { flex: 1; overflow-y: auto; padding: 8px 0; }
    .category { margin-bottom: 2px; }
    .category-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); padding: 8px 16px 4px; }
    .file-link { display: block; padding: 4px 16px 4px 24px; color: var(--text); text-decoration: none; font-size: 13px; border-left: 2px solid transparent; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .file-link:hover { background: var(--surface-2); color: var(--accent); }
    .file-link.active { background: var(--accent-dim); color: var(--accent); border-left-color: var(--accent); }

    /* Content */
    .content-wrapper { flex: 1; display: flex; overflow: hidden; }
    .content { flex: 1; overflow-y: auto; padding: 32px 48px; }
    .content-header { display: flex; justify-content: space-between; font-size: 13px; color: var(--text-dim); font-family: 'SF Mono', 'Fira Code', monospace; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
    .token-count { font-size: 12px; color: var(--text-dim); }

    /* TOC */
    .toc { width: 200px; min-width: 200px; border-left: 1px solid var(--border); padding: 24px 12px; overflow-y: auto; }
    .toc-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 10px; }
    .toc-link { display: block; font-size: 12px; color: var(--text-dim); text-decoration: none; padding: 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .toc-link:hover { color: var(--accent); }
    .toc-link.active { color: var(--accent); }
    .toc-link.d3 { padding-left: 10px; font-size: 11px; }
    .toc-link.d4 { padding-left: 20px; font-size: 11px; }

    /* Markdown */
    .md { line-height: 1.7; font-size: 15px; }
    .md h1 { font-size: 28px; font-weight: 600; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
    .md h2 { font-size: 22px; font-weight: 600; margin: 20px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
    .md h3 { font-size: 18px; font-weight: 600; margin: 16px 0 8px; }
    .md h4 { font-size: 15px; font-weight: 600; margin: 12px 0 8px; }
    .md p { margin: 0 0 12px; }
    .md a { color: var(--accent); text-decoration: none; }
    .md a:hover { text-decoration: underline; }
    .md code { background: var(--surface-2); padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: 'SF Mono', 'Fira Code', monospace; }
    .md pre { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; overflow-x: auto; margin: 0 0 16px; }
    .md pre code { background: none; padding: 0; font-size: 13px; line-height: 1.5; }
    .md ul, .md ol { margin: 0 0 12px; padding-left: 24px; }
    .md li { margin: 4px 0; }
    .md blockquote { border-left: 3px solid var(--accent); padding: 4px 16px; color: var(--text-dim); margin: 0 0 12px; }
    .md table { width: 100%; border-collapse: collapse; margin: 0 0 16px; }
    .md th, .md td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
    .md th { background: var(--surface); font-weight: 600; }
    .md tr:nth-child(even) { background: var(--surface-2); }
    .md hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
    .md img { max-width: 100%; border-radius: 8px; }

    .live { width: 6px; height: 6px; background: var(--green); border-radius: 50%; display: inline-block; margin-left: 6px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

    @media (max-width: 768px) {
      .sidebar { display: none; }
      .toc { display: none; }
      .content { padding: 16px; }
    }
  </style>
</head>
<body>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h1>${escapeHTML(projectName)} <span class="live" title="Live reload"></span></h1>
      <div class="sub">${files.length} files</div>
    </div>
    <div class="sidebar-search">
      <input type="text" id="search" placeholder="Filter..." autocomplete="off">
    </div>
    <nav class="sidebar-files" id="file-list">${sidebarHTML}</nav>
  </aside>

  <div class="content-wrapper">
    <main class="content" id="content"></main>
    <aside class="toc" id="toc">
      <div class="toc-title">On this page</div>
      <div id="toc-links"></div>
    </aside>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"></script>
  <script>
    marked.setOptions({
      highlight(code, lang) {
        if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
        return hljs.highlightAuto(code).value;
      },
      breaks: true, gfm: true,
    });

    const contentEl = document.getElementById('content');
    const tocEl = document.getElementById('toc-links');
    const links = document.querySelectorAll('.file-link');
    let currentFile = null;

    async function loadFile(path) {
      currentFile = path;
      const res = await fetch('/api/file?path=' + encodeURIComponent(path));
      const text = await res.text();

      const tokens = Math.ceil(text.split(/\\s+/).filter(w => w.length > 0).length * 1.33);

      contentEl.innerHTML =
        '<div class="content-header"><span>' + path + '</span><span class="token-count">' + tokens.toLocaleString() + ' tokens</span></div>' +
        '<div class="md">' + marked.parse(text) + '</div>';

      contentEl.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
      contentEl.scrollTop = 0;

      links.forEach(l => l.classList.remove('active'));
      document.querySelector('[data-path="' + CSS.escape(path) + '"]')?.classList.add('active');
      history.replaceState(null, '', '#' + encodeURIComponent(path));

      // Build TOC
      const headings = contentEl.querySelectorAll('.md h1, .md h2, .md h3, .md h4');
      tocEl.innerHTML = '';
      headings.forEach((h, i) => {
        h.id = 'h-' + i;
        const a = document.createElement('a');
        a.className = 'toc-link' + (h.tagName === 'H3' ? ' d3' : h.tagName === 'H4' ? ' d4' : '');
        a.href = '#h-' + i;
        a.textContent = h.textContent;
        a.onclick = (e) => { e.preventDefault(); h.scrollIntoView({ behavior: 'smooth' }); };
        tocEl.appendChild(a);
      });
    }

    links.forEach(link => {
      link.addEventListener('click', (e) => { e.preventDefault(); loadFile(link.dataset.path); });
    });

    document.getElementById('search').addEventListener('input', function() {
      const q = this.value.toLowerCase();
      links.forEach(link => { link.style.display = link.dataset.path.toLowerCase().includes(q) ? '' : 'none'; });
      document.querySelectorAll('.category').forEach(cat => {
        cat.style.display = Array.from(cat.querySelectorAll('.file-link')).some(l => l.style.display !== 'none') ? '' : 'none';
      });
    });

    // Live reload
    const es = new EventSource('/api/events');
    es.onmessage = () => { if (currentFile) loadFile(currentFile); };

    // Init
    if (location.hash) loadFile(decodeURIComponent(location.hash.slice(1)));
    else if (links.length > 0) loadFile(links[0].dataset.path);
  </script>
</body>
</html>`;
}

function openBrowser(url: string): void {
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} ${url}`);
}

export async function serveCommand(options: ServeOptions): Promise<void> {
  const projectRoot = process.cwd();
  const port = parseInt(options.port, 10);

  const files = await findMarkdownFiles(projectRoot);
  if (files.length === 0) {
    logger.error('No markdown files found.');
    process.exit(1);
  }

  let projectName = projectRoot.split('/').pop() || 'Project';
  try {
    const { findConfigPath, loadConfig } = await import('../core/config.js');
    const configPath = findConfigPath(projectRoot);
    if (configPath) {
      const config = await loadConfig(configPath);
      projectName = config.project.name;
    }
  } catch { /* use directory name */ }

  const html = getHTML(files, projectName);
  setupFileWatcher(projectRoot);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      res.write('data: {"type":"connected"}\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

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

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(html);
  });

  server.listen(port, () => {
    logger.success(`Serving ${files.length} files at http://localhost:${port}`);
    logger.dim('Live reload active. Ctrl+C to stop.\n');
    if (options.open !== false) openBrowser(`http://localhost:${port}`);
  });
}
