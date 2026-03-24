import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
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

interface TreeNode {
  name: string;
  path?: string; // only for files
  children: TreeNode[];
}

function buildTree(files: string[]): TreeNode {
  const root: TreeNode = { name: '', children: [] };

  for (const file of files) {
    const parts = file.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (isFile) {
        current.children.push({ name: part, path: file, children: [] });
      } else {
        let folder = current.children.find(c => c.name === part && !c.path);
        if (!folder) {
          folder = { name: part, children: [] };
          current.children.push(folder);
        }
        current = folder;
      }
    }
  }

  compactTree(root);
  return root;
}

/** VS Code-style: merge single-child folder chains into "a/b/c" */
function compactTree(node: TreeNode): void {
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.path) continue; // skip files

    // Keep compacting while this folder has exactly one child and it's a folder
    while (child.children.length === 1 && !child.children[0].path) {
      const grandchild = child.children[0];
      child.name = child.name + ' / ' + grandchild.name;
      child.children = grandchild.children;
    }

    compactTree(child);
  }
}

function renderTree(node: TreeNode, depth: number = 0): string {
  let html = '';
  const indent = Math.min(depth, 4) * 8; // 8px per level, cap at 4

  // Sort: folders first, then files
  const folders = node.children.filter(c => !c.path);
  const files = node.children.filter(c => c.path);

  for (const folder of folders) {
    html += `<div class="tree-folder" style="padding-left:${indent}px">
      <div class="tree-folder-head" onclick="this.parentElement.classList.toggle('collapsed')" title="${escapeHTML(folder.name)}">
        <svg class="chevron" width="12" height="12" viewBox="0 0 12 12"><path d="M4.5 2L8.5 6L4.5 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="tree-folder-name">${escapeHTML(folder.name)}</span>
      </div>
      <div class="tree-folder-children">${renderTree(folder, depth + 1)}</div>
    </div>`;
  }

  for (const file of files) {
    const name = file.name.replace(/\.md$/i, '');
    html += `<a class="tree-file" href="#" data-path="${escapeHTML(file.path!)}" style="padding-left:${indent + 18}px" title="${escapeHTML(file.path!)}">
      <svg class="doc-icon" width="14" height="14" viewBox="0 0 16 16"><path d="M3 1.5A1.5 1.5 0 014.5 0h5.379a1.5 1.5 0 011.06.44l2.122 2.12A1.5 1.5 0 0113.5 3.622V14.5a1.5 1.5 0 01-1.5 1.5h-8A1.5 1.5 0 013 14.5v-13z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 7h5M5.5 9.5h5M5.5 12h3" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
      <span>${escapeHTML(name)}</span>
    </a>`;
  }

  return html;
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
  const tree = buildTree(files);
  const sidebarHTML = renderTree(tree);

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
      --border: #30363d; --text: #c9d1d9; --text-dim: #7d8590;
      --accent: #58a6ff; --accent-dim: #1f6feb22; --green: #3fb950;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); display: flex; height: 100vh; overflow: hidden; }

    /* Sidebar */
    .sidebar { width: 250px; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; transition: width 0.2s ease, opacity 0.2s ease; overflow: hidden; }
    .sidebar.collapsed { width: 0; border-right: none; opacity: 0; pointer-events: none; }

    /* Resize handle */
    .resize-handle { width: 4px; cursor: col-resize; background: transparent; flex-shrink: 0; position: relative; z-index: 5; }
    .resize-handle::after { content: ''; position: absolute; top: 0; bottom: 0; left: 1px; width: 2px; background: transparent; border-radius: 1px; transition: background 0.15s; }
    .resize-handle:hover::after, .resize-handle.dragging::after { background: var(--accent); }
    .sidebar.collapsed + .resize-handle { display: none; }

    /* Hamburger */
    .hamburger { position: fixed; top: 12px; left: 12px; z-index: 20; background: var(--surface); border: 1px solid var(--border); color: var(--text); width: 32px; height: 32px; border-radius: 6px; cursor: pointer; display: none; align-items: center; justify-content: center; transition: opacity 0.2s; }
    .hamburger svg { width: 16px; height: 16px; }
    .hamburger.visible { display: flex; }
    .sidebar-header { padding: 16px 16px 14px; border-bottom: 1px solid var(--border); }
    .sidebar-header h1 { font-size: 13px; font-weight: 600; letter-spacing: 0.3px; display: flex; align-items: center; gap: 6px; }
    .sidebar-header .sub { font-size: 11px; color: var(--text-dim); margin-top: 4px; font-weight: 400; }
    .sidebar-search { padding: 8px 12px; }
    .sidebar-search input { width: 100%; padding: 5px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; color: var(--text); font-size: 12px; outline: none; transition: border-color 0.2s; }
    .sidebar-search input:focus { border-color: var(--accent); }
    .sidebar-search input::placeholder { color: var(--text-dim); }
    .sidebar-files { flex: 1; overflow-y: auto; padding: 4px 8px 16px; }

    /* Tree */
    .tree-folder { }
    .tree-folder-head { display: flex; align-items: center; gap: 4px; padding: 3px 6px; cursor: pointer; border-radius: 5px; user-select: none; font-size: 13px; color: var(--text-dim); font-weight: 500; }
    .tree-folder-head:hover { background: var(--surface-2); color: var(--text); }
    .chevron { transition: transform 0.15s ease; flex-shrink: 0; color: var(--text-dim); }
    .tree-folder:not(.collapsed) > .tree-folder-head .chevron { transform: rotate(90deg); }
    .tree-folder.collapsed > .tree-folder-children { display: none; }
    .tree-folder-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .tree-file { display: flex; align-items: center; gap: 6px; padding: 3px 6px; color: var(--text); text-decoration: none; font-size: 13px; border-radius: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: all 0.1s; }
    .tree-file:hover { background: var(--surface-2); }
    .tree-file.active { background: var(--accent-dim); color: var(--accent); }
    .tree-file.active .doc-icon { color: var(--accent); }
    .doc-icon { flex-shrink: 0; color: var(--text-dim); }

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

    /* Edit mode */
    .edit-wrap { display: flex; flex-direction: column; height: 100%; }
    .edit-toolbar { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid var(--border); }
    .edit-toolbar .filepath { font-size: 13px; color: var(--text-dim); font-family: 'SF Mono', 'Fira Code', monospace; }
    .edit-btns { display: flex; gap: 8px; }
    .edit-btns button { padding: 5px 14px; border-radius: 5px; border: 1px solid var(--border); font-size: 12px; cursor: pointer; transition: all 0.15s; }
    .btn-save { background: var(--accent); color: #fff; border-color: var(--accent); }
    .btn-save:hover { opacity: 0.85; }
    .btn-cancel { background: var(--surface-2); color: var(--text); }
    .btn-cancel:hover { background: var(--border); }
    .edit-area { flex: 1; width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 16px; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; line-height: 1.6; resize: none; outline: none; tab-size: 2; }
    .edit-area:focus { border-color: var(--accent); }
    .save-toast { position: fixed; bottom: 20px; right: 20px; background: var(--green); color: #000; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 30; }
    .save-toast.show { opacity: 1; }

    /* Content header actions */
    .header-actions { display: flex; align-items: center; gap: 10px; }
    .edit-btn { background: none; border: 1px solid var(--border); color: var(--text-dim); padding: 3px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: all 0.15s; }
    .edit-btn:hover { border-color: var(--accent); color: var(--accent); }

    /* Search */
    .search-results { padding: 4px 8px 16px; overflow-y: auto; flex: 1; }
    .search-result { padding: 6px 8px; border-radius: 5px; cursor: pointer; margin-bottom: 2px; }
    .search-result:hover { background: var(--surface-2); }
    .sr-file { font-size: 12px; color: var(--accent); font-weight: 500; margin-bottom: 2px; }
    .sr-line { font-size: 11px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sr-line em { font-style: normal; background: #d2992233; color: #d29922; border-radius: 2px; padding: 0 2px; }
    .sr-num { color: var(--text-dim); font-family: monospace; margin-right: 4px; }
    .search-mode .sidebar-files { display: none; }
    .search-mode .search-results { display: block; }
    .search-results { display: none; }

    .live { width: 6px; height: 6px; background: var(--green); border-radius: 50%; display: inline-block; margin-left: 6px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  </style>
</head>
<body>
  <button class="hamburger" id="hamburger" title="Show sidebar">
    <svg viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
  </button>

  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <h1>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="3" stroke="var(--accent)" stroke-width="1.5"/><path d="M5 5.5h6M5 8h4M5 10.5h5" stroke="var(--accent)" stroke-width="1.2" stroke-linecap="round"/></svg>
        ${escapeHTML(projectName)}
        <span class="live" title="Live reload"></span>
      </h1>
      <div class="sub">${files.length} docs</div>
    </div>
    <div class="sidebar-search">
      <input type="text" id="search" placeholder="Find docs..." autocomplete="off">
    </div>
    <nav class="sidebar-files" id="file-list">${sidebarHTML}</nav>
    <div class="search-results" id="search-results"></div>
  </aside>
  <div class="save-toast" id="save-toast">Saved</div>

  <div class="resize-handle" id="resize-handle"></div>

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
    const links = document.querySelectorAll('.tree-file');
    let currentFile = null;

    let editMode = false;
    const sidebarEl = document.getElementById('sidebar');
    const searchResultsEl = document.getElementById('search-results');
    const toast = document.getElementById('save-toast');

    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }

    async function loadFile(path, skipScroll) {
      currentFile = path;
      editMode = false;
      const res = await fetch('/api/file?path=' + encodeURIComponent(path));
      const text = await res.text();
      const tokens = Math.ceil(text.split(/\\s+/).filter(w => w.length > 0).length * 1.33);

      contentEl.innerHTML =
        '<div class="content-header"><span>' + path + '</span><div class="header-actions"><span class="token-count">' + tokens.toLocaleString() + ' tokens</span><button class="edit-btn" id="edit-btn">Edit</button></div></div>' +
        '<div class="md">' + marked.parse(text) + '</div>';

      contentEl.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
      if (!skipScroll) contentEl.scrollTop = 0;

      links.forEach(l => l.classList.remove('active'));
      document.querySelector('[data-path="' + CSS.escape(path) + '"]')?.classList.add('active');
      history.replaceState(null, '', '#' + encodeURIComponent(path));

      // Edit button
      document.getElementById('edit-btn').onclick = () => enterEditMode(path, text);

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

    function enterEditMode(path, text) {
      editMode = true;
      tocEl.innerHTML = '<div style="font-size:12px;color:var(--text-dim)">Editing...</div>';
      contentEl.innerHTML =
        '<div class="edit-wrap">' +
          '<div class="edit-toolbar"><span class="filepath">' + path + '</span><div class="edit-btns"><button class="btn-cancel" id="cancel-btn">Cancel</button><button class="btn-save" id="save-btn">Save</button></div></div>' +
          '<textarea class="edit-area" id="editor"></textarea>' +
        '</div>';
      const editor = document.getElementById('editor');
      editor.value = text;
      editor.focus();

      // Tab key inserts spaces
      editor.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const s = editor.selectionStart, end = editor.selectionEnd;
          editor.value = editor.value.substring(0, s) + '  ' + editor.value.substring(end);
          editor.selectionStart = editor.selectionEnd = s + 2;
        }
        if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          document.getElementById('save-btn').click();
        }
      });

      document.getElementById('cancel-btn').onclick = () => loadFile(path);
      document.getElementById('save-btn').onclick = async () => {
        const body = editor.value;
        const r = await fetch('/api/save?path=' + encodeURIComponent(path), { method: 'POST', body });
        if (r.ok) {
          showToast('Saved');
          loadFile(path);
        } else {
          showToast('Save failed');
        }
      };
    }

    links.forEach(link => {
      link.addEventListener('click', (e) => { e.preventDefault(); loadFile(link.dataset.path); });
    });

    // Search — switches between filter mode and full-text search
    let searchTimeout = null;
    const searchInput = document.getElementById('search');

    searchInput.addEventListener('input', function() {
      const q = this.value;
      clearTimeout(searchTimeout);

      if (q.length < 2) {
        // Filter mode
        sidebarEl.classList.remove('search-mode');
        const ql = q.toLowerCase();
        links.forEach(link => { link.style.display = link.dataset.path.toLowerCase().includes(ql) ? '' : 'none'; });
        document.querySelectorAll('.tree-folder').forEach(folder => {
          const hasVisible = Array.from(folder.querySelectorAll('.tree-file')).some(l => l.style.display !== 'none');
          folder.style.display = hasVisible ? '' : 'none';
          if (ql && hasVisible) folder.classList.remove('collapsed');
        });
        return;
      }

      // Full-text search (debounced)
      searchTimeout = setTimeout(async () => {
        const res = await fetch('/api/search?q=' + encodeURIComponent(q));
        const results = await res.json();
        sidebarEl.classList.add('search-mode');

        if (results.length === 0) {
          searchResultsEl.innerHTML = '<div style="padding:12px;color:var(--text-dim);font-size:12px">No results</div>';
          return;
        }

        const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const highlight = (text, q) => {
          const re = new RegExp('(' + q.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + ')', 'gi');
          return esc(text).replace(re, '<em>$1</em>');
        };

        searchResultsEl.innerHTML = results.map(r =>
          '<div class="search-result" data-path="' + esc(r.path) + '">' +
            '<div class="sr-file">' + esc(r.path) + '</div>' +
            r.matches.map(m => '<div class="sr-line"><span class="sr-num">L' + m.line + '</span>' + highlight(m.text, q) + '</div>').join('') +
          '</div>'
        ).join('');

        searchResultsEl.querySelectorAll('.search-result').forEach(el => {
          el.addEventListener('click', () => {
            loadFile(el.dataset.path);
            searchInput.value = '';
            sidebarEl.classList.remove('search-mode');
            links.forEach(l => { l.style.display = ''; });
            document.querySelectorAll('.tree-folder').forEach(f => { f.style.display = ''; });
          });
        });
      }, 250);
    });

    // Live reload
    const es = new EventSource('/api/events');
    es.onmessage = () => { if (currentFile) loadFile(currentFile); };

    // Resizable sidebar
    const sidebar = document.getElementById('sidebar');
    const handle = document.getElementById('resize-handle');
    const hamburger = document.getElementById('hamburger');
    const MIN_W = 180, MAX_W = 500, SNAP_CLOSE = 100;
    let dragging = false;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      handle.classList.add('dragging');
      sidebar.style.transition = 'none';
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const w = e.clientX;
      if (w < SNAP_CLOSE) {
        sidebar.classList.add('collapsed');
        hamburger.classList.add('visible');
      } else {
        sidebar.classList.remove('collapsed');
        hamburger.classList.remove('visible');
        sidebar.style.width = Math.min(Math.max(w, MIN_W), MAX_W) + 'px';
      }
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      sidebar.style.transition = '';
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });

    hamburger.addEventListener('click', () => {
      sidebar.classList.remove('collapsed');
      sidebar.style.width = '250px';
      hamburger.classList.remove('visible');
    });

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

    // Save file (edit mode)
    if (url.pathname === '/api/save' && req.method === 'POST') {
      const filePath = url.searchParams.get('path');
      if (!filePath) { res.writeHead(400); res.end('Missing path'); return; }
      const resolved = join(projectRoot, filePath);
      if (!resolved.startsWith(projectRoot)) { res.writeHead(403); res.end('Forbidden'); return; }
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        try {
          await writeFile(resolved, Buffer.concat(chunks).toString('utf-8'), 'utf-8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // Full-text search
    if (url.pathname === '/api/search') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      if (q.length < 2) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); return; }
      const results: { path: string; matches: { line: number; text: string }[] }[] = [];
      for (const f of files) {
        try {
          const content = await readFile(join(projectRoot, f), 'utf-8');
          const matches: { line: number; text: string }[] = [];
          content.split('\n').forEach((line, i) => {
            if (line.toLowerCase().includes(q)) matches.push({ line: i + 1, text: line.trim().slice(0, 150) });
          });
          if (matches.length > 0) results.push({ path: f, matches: matches.slice(0, 5) });
        } catch { /* skip */ }
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(results));
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
