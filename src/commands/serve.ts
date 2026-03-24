import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
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
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
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
      --bg: #0d1117;
      --surface: #161b22;
      --surface-2: #1c2333;
      --border: #30363d;
      --text: #e6edf3;
      --text-dim: #7d8590;
      --accent: #58a6ff;
      --accent-dim: #1f6feb33;
      --green: #3fb950;
      --sidebar-w: 280px;
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

    .sidebar-search input:focus {
      border-color: var(--accent);
    }

    .sidebar-files {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .category {
      margin-bottom: 4px;
    }

    .category-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
      padding: 8px 16px 4px;
    }

    .file-link {
      display: block;
      padding: 5px 16px 5px 24px;
      color: var(--text);
      text-decoration: none;
      font-size: 13px;
      border-left: 2px solid transparent;
      transition: all 0.15s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .file-link:hover {
      background: var(--surface-2);
      color: var(--accent);
    }

    .file-link.active {
      background: var(--accent-dim);
      color: var(--accent);
      border-left-color: var(--accent);
    }

    /* Content */
    .content {
      flex: 1;
      overflow-y: auto;
      padding: 32px 48px;
    }

    .content-header {
      display: flex;
      align-items: center;
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
    .welcome p { font-size: 14px; }

    /* Markdown rendered content */
    .markdown-body {
      line-height: 1.7;
      font-size: 15px;
    }

    .markdown-body h1 { font-size: 28px; font-weight: 600; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
    .markdown-body h2 { font-size: 22px; font-weight: 600; margin: 20px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
    .markdown-body h3 { font-size: 18px; font-weight: 600; margin: 16px 0 8px; }
    .markdown-body h4 { font-size: 15px; font-weight: 600; margin: 12px 0 8px; }

    .markdown-body p { margin: 0 0 12px; }

    .markdown-body a { color: var(--accent); text-decoration: none; }
    .markdown-body a:hover { text-decoration: underline; }

    .markdown-body code {
      background: var(--surface-2);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
      font-family: 'SF Mono', 'Fira Code', monospace;
    }

    .markdown-body pre {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      overflow-x: auto;
      margin: 0 0 16px;
    }

    .markdown-body pre code {
      background: none;
      padding: 0;
      font-size: 13px;
      line-height: 1.5;
    }

    .markdown-body ul, .markdown-body ol {
      margin: 0 0 12px;
      padding-left: 24px;
    }

    .markdown-body li { margin: 4px 0; }

    .markdown-body blockquote {
      border-left: 3px solid var(--accent);
      padding: 4px 16px;
      color: var(--text-dim);
      margin: 0 0 12px;
    }

    .markdown-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 16px;
    }

    .markdown-body th, .markdown-body td {
      border: 1px solid var(--border);
      padding: 8px 12px;
      text-align: left;
    }

    .markdown-body th {
      background: var(--surface);
      font-weight: 600;
    }

    .markdown-body tr:nth-child(even) { background: var(--surface-2); }

    .markdown-body hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 24px 0;
    }

    .markdown-body img { max-width: 100%; border-radius: 8px; }

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
      .menu-toggle { display: block !important; }
    }

    .menu-toggle {
      display: none;
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 20;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <button class="menu-toggle" onclick="document.querySelector('.sidebar').classList.toggle('open')">&#9776;</button>

  <aside class="sidebar">
    <div class="sidebar-header">
      <h1>${escapeHTML(projectName)}</h1>
      <span class="badge">${files.length} markdown files</span>
    </div>
    <div class="sidebar-search">
      <input type="text" id="search" placeholder="Filter files..." autocomplete="off">
    </div>
    <nav class="sidebar-files" id="file-list">
      ${sidebarHTML}
    </nav>
  </aside>

  <main class="content" id="content">
    <div class="welcome">
      <h2>agentctx</h2>
      <p>Select a markdown file from the sidebar to view it.</p>
    </div>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"></script>
  <script>
    marked.setOptions({
      highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      },
      breaks: true,
      gfm: true,
    });

    const content = document.getElementById('content');
    const links = document.querySelectorAll('.file-link');
    const search = document.getElementById('search');

    async function loadFile(path) {
      const res = await fetch('/api/file?path=' + encodeURIComponent(path));
      const text = await res.text();
      const html = marked.parse(text);

      content.innerHTML = \`
        <div class="content-header">
          <span class="filepath">\${path}</span>
        </div>
        <div class="markdown-body">\${html}</div>
      \`;

      content.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
      content.scrollTop = 0;

      links.forEach(l => l.classList.remove('active'));
      document.querySelector(\`[data-path="\${CSS.escape(path)}"]\`)?.classList.add('active');

      history.replaceState(null, '', '#' + encodeURIComponent(path));
      document.querySelector('.sidebar').classList.remove('open');
    }

    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        loadFile(link.dataset.path);
      });
    });

    search.addEventListener('input', () => {
      const q = search.value.toLowerCase();
      links.forEach(link => {
        const match = link.dataset.path.toLowerCase().includes(q);
        link.style.display = match ? '' : 'none';
      });
      document.querySelectorAll('.category').forEach(cat => {
        const visible = cat.querySelectorAll('.file-link[style=""],.file-link:not([style])');
        const anyVisible = Array.from(cat.querySelectorAll('.file-link')).some(l => l.style.display !== 'none');
        cat.style.display = anyVisible ? '' : 'none';
      });
    });

    // Load from hash
    if (location.hash) {
      loadFile(decodeURIComponent(location.hash.slice(1)));
    } else if (links.length > 0) {
      loadFile(links[0].dataset.path);
    }
  </script>
</body>
</html>`;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openBrowser(url: string): void {
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} ${url}`);
}

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

  const html = getHTML(files, projectName);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    if (url.pathname === '/api/file') {
      const filePath = url.searchParams.get('path');
      if (!filePath) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing path parameter');
        return;
      }

      // Prevent directory traversal
      const resolved = join(projectRoot, filePath);
      if (!resolved.startsWith(projectRoot)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      try {
        const content = await readFile(resolved, 'utf-8');
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        res.end(content);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
      }
      return;
    }

    // Serve the SPA
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(html);
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    logger.success(`Serving at ${url}`);
    logger.dim(`${files.length} markdown files from ${projectRoot}`);
    logger.dim('Press Ctrl+C to stop\n');

    if (options.open !== false) {
      openBrowser(url);
    }
  });
}
