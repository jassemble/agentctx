import { join, relative, dirname, basename, extname } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import type { CodebaseProfile } from './detector.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface ApiRoute {
  path: string;
  filePath: string;
  methods: string[];
  handler: string;
}

export interface HookDef {
  name: string;
  filePath: string;
  apiCalls: string[];
  exports: string[];
}

export interface ServiceDef {
  name: string;
  filePath: string;
  exports: string[];
}

export interface ErrorBoundary {
  filePath: string;
  type: string;
  scope: string;
}

export interface ImportEdge {
  from: string;
  to: string;
  symbols: string[];
}

export interface CodeMap {
  apiRoutes: ApiRoute[];
  hooks: HookDef[];
  services: ServiceDef[];
  errorBoundaries: ErrorBoundary[];
  importGraph: ImportEdge[];
}

// ── Helpers ────────────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', '__pycache__', 'dist', '.agentctx',
  '.turbo', '.cache', 'coverage', '.vercel', 'build', 'out',
]);

function walkFiles(dir: string, root: string, pattern: RegExp, maxFiles = 200): string[] {
  const results: string[] = [];

  function walk(current: string): void {
    if (results.length >= maxFiles) return;
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(join(current, entry.name));
        }
      } else if (pattern.test(entry.name)) {
        results.push(relative(root, join(current, entry.name)));
      }
    }
  }

  if (existsSync(dir)) walk(dir);
  return results;
}

function readSafe(path: string): string | null {
  try { return readFileSync(path, 'utf-8'); } catch { return null; }
}

function resolveTsConfigPaths(root: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const tsConfig = readSafe(join(root, 'tsconfig.json'));
  if (!tsConfig) return aliases;

  try {
    // Strip comments for JSON parsing
    const cleaned = tsConfig.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const config = JSON.parse(cleaned);
    const paths = config?.compilerOptions?.paths;
    if (!paths) return aliases;

    for (const [alias, targets] of Object.entries(paths)) {
      const target = (targets as string[])[0];
      if (alias && target) {
        // "@/*" -> "src/*"  =>  "@/" -> "src/"
        aliases.set(
          alias.replace(/\*$/, ''),
          target.replace(/\*$/, ''),
        );
      }
    }
  } catch { /* ignore */ }
  return aliases;
}

function resolveImportPath(
  importPath: string,
  fromFile: string,
  root: string,
  aliases: Map<string, string>,
): string | null {
  let resolved: string;

  if (importPath.startsWith('.')) {
    // Relative import
    resolved = join(dirname(join(root, fromFile)), importPath);
  } else {
    // Check aliases
    for (const [alias, target] of aliases) {
      if (importPath.startsWith(alias)) {
        resolved = join(root, importPath.replace(alias, target));
        break;
      }
    }
    // Not a relative or aliased import — it's a package, skip
    if (!importPath.startsWith('.') && !Array.from(aliases.keys()).some(a => importPath.startsWith(a))) {
      return null;
    }
    resolved = resolved!;
  }

  // Try extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
  for (const ext of extensions) {
    const full = resolved + ext;
    if (existsSync(full)) return relative(root, full);
  }
  // Try exact path
  if (existsSync(resolved)) return relative(root, resolved);

  return null;
}

// ── API Route Scanners ─────────────────────────────────────────────────

function scanNextjsAppRoutes(root: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const routeFiles = walkFiles(root, root, /^route\.(ts|js|tsx|jsx)$/);

  for (const filePath of routeFiles) {
    const content = readSafe(join(root, filePath));
    if (!content) continue;

    // Derive route path from directory structure
    // src/app/api/users/[id]/route.ts -> /api/users/[id]
    const dir = dirname(filePath);
    const routePath = '/' + dir
      .replace(/^src\/app\//, '')
      .replace(/^app\//, '')
      .replace(/\/?$/, '');

    // Find exported HTTP methods
    const methods: string[] = [];
    const handlers: string[] = [];
    const methodPattern = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/g;
    let match;
    while ((match = methodPattern.exec(content)) !== null) {
      methods.push(match[1]);
      handlers.push(`${match[1]}()`);
    }

    if (methods.length > 0) {
      routes.push({ path: routePath, filePath, methods, handler: handlers.join(', ') });
    }
  }

  return routes;
}

function scanNextjsPagesRoutes(root: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const apiDir = join(root, 'pages', 'api');
  const files = walkFiles(apiDir, root, /\.(ts|js|tsx|jsx)$/);

  for (const filePath of files) {
    const routePath = '/api/' + filePath
      .replace(/^pages\/api\//, '')
      .replace(/\.(ts|js|tsx|jsx)$/, '')
      .replace(/\/index$/, '');

    routes.push({ path: routePath, filePath, methods: ['*'], handler: 'default export' });
  }

  return routes;
}

function scanExpressRoutes(root: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const files = [
    ...walkFiles(join(root, 'src'), root, /\.(ts|js)$/),
    ...walkFiles(join(root, 'routes'), root, /\.(ts|js)$/),
  ];

  for (const filePath of files) {
    const content = readSafe(join(root, filePath));
    if (!content) continue;

    // Match router.get('/path', ...) or app.post('/path', ...)
    const routePattern = /(?:router|app)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = routePattern.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = match[2];

      // Check if route already exists
      const existing = routes.find(r => r.path === routePath && r.filePath === filePath);
      if (existing) {
        if (!existing.methods.includes(method)) {
          existing.methods.push(method);
          existing.handler += `, ${method}`;
        }
      } else {
        routes.push({ path: routePath, filePath, methods: [method], handler: method });
      }
    }

    // Check for app.use('/prefix', router) mount points
    const mountPattern = /app\.use\s*\(\s*['"`]([^'"`]+)['"`]\s*,/g;
    while ((match = mountPattern.exec(content)) !== null) {
      routes.push({ path: `${match[1]}/*`, filePath, methods: ['MOUNT'], handler: 'router mount' });
    }
  }

  return routes;
}

function scanFastApiRoutes(root: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const files = walkFiles(root, root, /\.py$/);

  for (const filePath of files) {
    const content = readSafe(join(root, filePath));
    if (!content) continue;

    // Match @app.get("/path") or @router.post("/path")
    const routePattern = /@(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/g;
    let match;
    while ((match = routePattern.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = match[2];

      const existing = routes.find(r => r.path === routePath && r.filePath === filePath);
      if (existing) {
        if (!existing.methods.includes(method)) {
          existing.methods.push(method);
          existing.handler += `, ${method.toLowerCase()}`;
        }
      } else {
        // Find function name on next line
        const funcMatch = content.slice(match.index).match(/@[^\n]+\n(?:async\s+)?def\s+(\w+)/);
        const handler = funcMatch ? funcMatch[1] : method.toLowerCase();
        routes.push({ path: routePath, filePath, methods: [method], handler });
      }
    }
  }

  return routes;
}

function scanHonoRoutes(root: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const files = walkFiles(join(root, 'src'), root, /\.(ts|js)$/);

  for (const filePath of files) {
    const content = readSafe(join(root, filePath));
    if (!content) continue;

    const routePattern = /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = routePattern.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = match[2];

      const existing = routes.find(r => r.path === routePath && r.filePath === filePath);
      if (existing) {
        if (!existing.methods.includes(method)) {
          existing.methods.push(method);
        }
      } else {
        routes.push({ path: routePath, filePath, methods: [method], handler: method });
      }
    }
  }

  return routes;
}

async function scanApiRoutes(root: string, profile: CodebaseProfile): Promise<ApiRoute[]> {
  const routes: ApiRoute[] = [];

  switch (profile.framework) {
    case 'nextjs': {
      // Try App Router first, then Pages Router
      const appRoutes = scanNextjsAppRoutes(root);
      if (appRoutes.length > 0) {
        routes.push(...appRoutes);
      }
      // Also check pages/api
      const pagesRoutes = scanNextjsPagesRoutes(root);
      routes.push(...pagesRoutes);

      // Also scan for Next.js Server Actions
      const actionFiles = walkFiles(root, root, /\.(ts|tsx|js|jsx)$/);
      for (const filePath of actionFiles) {
        if (filePath.includes('node_modules')) continue;
        const content = readSafe(join(root, filePath));
        if (!content || !content.includes("'use server'")) continue;

        const funcPattern = /export\s+(?:async\s+)?function\s+(\w+)/g;
        let match;
        const actions: string[] = [];
        while ((match = funcPattern.exec(content)) !== null) {
          actions.push(match[1]);
        }
        if (actions.length > 0) {
          routes.push({
            path: `[server action]`,
            filePath,
            methods: ['ACTION'],
            handler: actions.join(', '),
          });
        }
      }
      break;
    }
    case 'express':
      routes.push(...scanExpressRoutes(root));
      break;
    case 'fastapi':
      routes.push(...scanFastApiRoutes(root));
      break;
    case 'hono':
      routes.push(...scanHonoRoutes(root));
      break;
    default:
      // Try all patterns
      routes.push(...scanNextjsAppRoutes(root));
      routes.push(...scanNextjsPagesRoutes(root));
      routes.push(...scanExpressRoutes(root));
      routes.push(...scanFastApiRoutes(root));
      break;
  }

  return routes.slice(0, 30);
}

// ── Hook Scanner ───────────────────────────────────────────────────────

async function scanHooks(root: string, profile: CodebaseProfile): Promise<HookDef[]> {
  if (profile.language === 'python') return []; // Python doesn't use hooks pattern

  const hooks: HookDef[] = [];
  const hookFiles = new Set<string>();

  // Glob patterns for hook files
  const patterns = [
    { dir: join(root, 'src', 'hooks'), regex: /\.(ts|tsx|js|jsx)$/ },
    { dir: join(root, 'hooks'), regex: /\.(ts|tsx|js|jsx)$/ },
    { dir: join(root, 'src', 'lib', 'hooks'), regex: /\.(ts|tsx|js|jsx)$/ },
    { dir: join(root, 'src'), regex: /^use[A-Z].*\.(ts|tsx|js|jsx)$/ },
    { dir: join(root, 'lib'), regex: /^use[A-Z].*\.(ts|tsx|js|jsx)$/ },
  ];

  for (const { dir, regex } of patterns) {
    for (const file of walkFiles(dir, root, regex)) {
      hookFiles.add(file);
    }
  }

  for (const filePath of hookFiles) {
    const content = readSafe(join(root, filePath));
    if (!content) continue;

    // Find exported hooks (use* pattern)
    const exports: string[] = [];
    const hookNamePattern = /export\s+(?:(?:default\s+)?function|const)\s+(use[A-Z]\w*)/g;
    let match;
    while ((match = hookNamePattern.exec(content)) !== null) {
      exports.push(match[1]);
    }

    if (exports.length === 0) continue;

    // Find API calls within the hook
    const apiCalls: string[] = [];

    // fetch('/api/...') or fetch(`/api/...`)
    const fetchPattern = /fetch\s*\(\s*['"`]([^'"`\s]+)['"`]/g;
    while ((match = fetchPattern.exec(content)) !== null) {
      if (match[1].startsWith('/') || match[1].startsWith('http')) {
        apiCalls.push(match[1]);
      }
    }

    // fetch(`${BASE_URL}/path`) — extract the path part
    const templateFetchPattern = /fetch\s*\(\s*`[^`]*\/([^`\s]+)`/g;
    while ((match = templateFetchPattern.exec(content)) !== null) {
      const path = '/' + match[1];
      if (!apiCalls.includes(path)) apiCalls.push(path);
    }

    // axios.get('/api/...') etc.
    const axiosPattern = /(?:axios|api|client)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`\s]+)['"`]/g;
    while ((match = axiosPattern.exec(content)) !== null) {
      if (!apiCalls.includes(match[2])) apiCalls.push(match[2]);
    }

    hooks.push({
      name: exports[0],
      filePath,
      apiCalls: [...new Set(apiCalls)],
      exports,
    });
  }

  return hooks.slice(0, 20);
}

// ── Service Scanner ────────────────────────────────────────────────────

async function scanServices(root: string, profile: CodebaseProfile): Promise<ServiceDef[]> {
  const services: ServiceDef[] = [];
  const serviceFiles = new Set<string>();

  const dirs = profile.language === 'python'
    ? ['app/services', 'app/lib', 'services', 'lib']
    : ['src/services', 'src/lib', 'services', 'lib', 'src/utils'];

  const ext = profile.language === 'python' ? /\.py$/ : /\.(ts|js)$/;

  for (const dir of dirs) {
    for (const file of walkFiles(join(root, dir), root, ext)) {
      // Skip test files, index files, hook files
      if (/\.(test|spec)\./i.test(file)) continue;
      if (/^use[A-Z]/.test(basename(file))) continue;
      serviceFiles.add(file);
    }
  }

  for (const filePath of serviceFiles) {
    const content = readSafe(join(root, filePath));
    if (!content) continue;

    const exports: string[] = [];

    if (profile.language === 'python') {
      // Top-level def/class (not indented)
      const pyPattern = /^(?:async\s+)?(?:def|class)\s+(\w+)/gm;
      let match;
      while ((match = pyPattern.exec(content)) !== null) {
        if (!match[1].startsWith('_')) exports.push(match[1]);
      }
    } else {
      const tsPattern = /export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g;
      let match;
      while ((match = tsPattern.exec(content)) !== null) {
        exports.push(match[1]);
      }
    }

    if (exports.length === 0) continue;

    const name = basename(filePath, extname(filePath));
    services.push({ name, filePath, exports: exports.slice(0, 10) });
  }

  return services.slice(0, 20);
}

// ── Error Boundary Scanner ─────────────────────────────────────────────

async function scanErrorBoundaries(root: string, profile: CodebaseProfile): Promise<ErrorBoundary[]> {
  const boundaries: ErrorBoundary[] = [];

  if (profile.framework === 'nextjs') {
    // Next.js error.tsx files
    const errorFiles = walkFiles(root, root, /^error\.(tsx|jsx|ts|js)$/);
    for (const filePath of errorFiles) {
      const dir = dirname(filePath)
        .replace(/^src\/app\/?/, '')
        .replace(/^app\/?/, '');
      const scope = dir ? `/${dir}` : 'global';
      boundaries.push({ filePath, type: 'next-error-page', scope });
    }

    // Next.js global-error.tsx
    const globalErrorFiles = walkFiles(root, root, /^global-error\.(tsx|jsx)$/);
    for (const filePath of globalErrorFiles) {
      boundaries.push({ filePath, type: 'next-global-error', scope: 'global' });
    }

    // not-found.tsx
    const notFoundFiles = walkFiles(root, root, /^not-found\.(tsx|jsx)$/);
    for (const filePath of notFoundFiles) {
      const dir = dirname(filePath)
        .replace(/^src\/app\/?/, '')
        .replace(/^app\/?/, '');
      boundaries.push({ filePath, type: 'next-not-found', scope: dir ? `/${dir}` : 'global' });
    }
  }

  // Middleware files
  for (const name of ['middleware.ts', 'middleware.js', 'src/middleware.ts', 'src/middleware.js']) {
    const fullPath = join(root, name);
    if (existsSync(fullPath)) {
      boundaries.push({ filePath: name, type: 'middleware', scope: 'global' });
    }
  }

  // React ErrorBoundary components
  const tsxFiles = walkFiles(root, root, /\.(tsx|jsx)$/);
  for (const filePath of tsxFiles) {
    if (basename(filePath).toLowerCase().includes('error-boundary') ||
        basename(filePath).toLowerCase().includes('errorboundary')) {
      boundaries.push({
        filePath,
        type: 'react-error-boundary',
        scope: dirname(filePath).replace(/^src\/?/, ''),
      });
    }
  }

  // Express error middleware (4-param handlers)
  if (profile.framework === 'express') {
    const jsFiles = walkFiles(root, root, /\.(ts|js)$/);
    for (const filePath of jsFiles) {
      const content = readSafe(join(root, filePath));
      if (!content) continue;
      if (/\(\s*err\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/.test(content)) {
        boundaries.push({ filePath, type: 'express-error-middleware', scope: 'global' });
      }
    }
  }

  // FastAPI exception handlers
  if (profile.framework === 'fastapi') {
    const pyFiles = walkFiles(root, root, /\.py$/);
    for (const filePath of pyFiles) {
      const content = readSafe(join(root, filePath));
      if (!content) continue;
      if (/@app\.exception_handler/.test(content)) {
        boundaries.push({ filePath, type: 'fastapi-exception-handler', scope: 'global' });
      }
    }
  }

  return boundaries;
}

// ── Import Graph Builder ───────────────────────────────────────────────

async function buildImportGraph(
  root: string,
  profile: CodebaseProfile,
  map: CodeMap,
): Promise<ImportEdge[]> {
  const edges: ImportEdge[] = [];
  const aliases = resolveTsConfigPaths(root);

  // Collect all "important" file paths
  const knownFiles = new Set<string>();
  for (const r of map.apiRoutes) knownFiles.add(r.filePath);
  for (const h of map.hooks) knownFiles.add(h.filePath);
  for (const s of map.services) knownFiles.add(s.filePath);
  for (const e of map.errorBoundaries) knownFiles.add(e.filePath);

  // For each known file, extract its imports and keep only edges to other known files
  for (const filePath of knownFiles) {
    const content = readSafe(join(root, filePath));
    if (!content) continue;

    if (profile.language === 'python') {
      // from X import Y, Z
      const pyImportPattern = /^from\s+(\S+)\s+import\s+(.+)$/gm;
      let match;
      while ((match = pyImportPattern.exec(content)) !== null) {
        const modulePath = match[1].replace(/\./g, '/') + '.py';
        const symbols = match[2].split(',').map(s => s.trim().split(' as ')[0].trim());
        if (knownFiles.has(modulePath)) {
          edges.push({ from: filePath, to: modulePath, symbols });
        }
      }
    } else {
      // import { X, Y } from 'path'
      const importPattern = /import\s+(?:(?:type\s+)?{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importPattern.exec(content)) !== null) {
        const symbols = match[1]
          ? match[1].split(',').map(s => s.trim().split(' as ')[0].trim()).filter(Boolean)
          : [match[2]];
        const importPath = match[3];

        const resolved = resolveImportPath(importPath, filePath, root, aliases);
        if (resolved && knownFiles.has(resolved)) {
          edges.push({ from: filePath, to: resolved, symbols });
        }
      }
    }
  }

  return edges;
}

// ── Main Scanner ───────────────────────────────────────────────────────

export async function scanCodeMap(
  projectRoot: string,
  profile: CodebaseProfile,
): Promise<CodeMap> {
  const map: CodeMap = {
    apiRoutes: [],
    hooks: [],
    services: [],
    errorBoundaries: [],
    importGraph: [],
  };

  map.apiRoutes = await scanApiRoutes(projectRoot, profile);
  map.hooks = await scanHooks(projectRoot, profile);
  map.services = await scanServices(projectRoot, profile);
  map.errorBoundaries = await scanErrorBoundaries(projectRoot, profile);
  map.importGraph = await buildImportGraph(projectRoot, profile, map);

  return map;
}

// ── Markdown Renderer ──────────────────────────────────────────────────

export function renderCodeMapMarkdown(map: CodeMap): string {
  const lines: string[] = [];

  lines.push('# Code Map');
  lines.push('');
  lines.push('> Auto-generated by `agentctx scan --deep`. Maps API routes, hooks, services, and their connections.');
  lines.push('');

  // Key Files section (for Module Index extraction)
  lines.push('## Key Files');
  for (const r of map.apiRoutes.slice(0, 10)) {
    lines.push(`- \`${r.filePath}\` — API: ${r.path} [${r.methods.join(', ')}]`);
  }
  for (const h of map.hooks.slice(0, 10)) {
    const calls = h.apiCalls.length > 0 ? ` → ${h.apiCalls.join(', ')}` : '';
    lines.push(`- \`${h.filePath}\` — Hook: ${h.name}${calls}`);
  }
  for (const s of map.services.slice(0, 10)) {
    lines.push(`- \`${s.filePath}\` — Service: ${s.exports.slice(0, 3).join(', ')}`);
  }
  for (const e of map.errorBoundaries.slice(0, 5)) {
    lines.push(`- \`${e.filePath}\` — Error boundary: ${e.scope} (${e.type})`);
  }
  lines.push('');

  // API Routes table
  if (map.apiRoutes.length > 0) {
    lines.push('## API Routes');
    lines.push('');
    lines.push('| Route | File | Methods | Handler |');
    lines.push('|-------|------|---------|---------|');
    for (const r of map.apiRoutes) {
      lines.push(`| \`${r.path}\` | \`${r.filePath}\` | ${r.methods.join(', ')} | ${r.handler} |`);
    }
    if (map.apiRoutes.length >= 30) {
      lines.push(`| ... | *${map.apiRoutes.length}+ routes — run \`agentctx scan --deep --verbose\` for full list* | | |`);
    }
    lines.push('');
  }

  // Hooks table
  if (map.hooks.length > 0) {
    lines.push('## Hooks');
    lines.push('');
    lines.push('| Hook | File | Calls | Exports |');
    lines.push('|------|------|-------|---------|');
    for (const h of map.hooks) {
      const calls = h.apiCalls.length > 0 ? h.apiCalls.join(', ') : '—';
      lines.push(`| \`${h.name}\` | \`${h.filePath}\` | ${calls} | ${h.exports.join(', ')} |`);
    }
    lines.push('');
  }

  // Services table
  if (map.services.length > 0) {
    lines.push('## Services');
    lines.push('');
    lines.push('| Service | File | Exports |');
    lines.push('|---------|------|---------|');
    for (const s of map.services) {
      lines.push(`| ${s.name} | \`${s.filePath}\` | ${s.exports.slice(0, 5).join(', ')} |`);
    }
    lines.push('');
  }

  // Call Graph — connect hooks to routes to services
  const callChains: string[] = [];
  for (const hook of map.hooks) {
    for (const apiCall of hook.apiCalls) {
      const route = map.apiRoutes.find(r => r.path === apiCall);
      if (route) {
        // Find if the route file imports any services
        const routeImports = map.importGraph.filter(e => e.from === route.filePath);
        if (routeImports.length > 0) {
          for (const imp of routeImports) {
            const service = map.services.find(s => s.filePath === imp.to);
            if (service) {
              callChains.push(`- \`${hook.name}\` → \`${apiCall}\` → \`${service.name}.${imp.symbols[0] || '...'}\``);
            }
          }
        } else {
          callChains.push(`- \`${hook.name}\` → \`${apiCall}\` → \`${route.filePath}\``);
        }
      } else {
        callChains.push(`- \`${hook.name}\` → \`${apiCall}\``);
      }
    }
  }

  if (callChains.length > 0) {
    lines.push('## Call Graph');
    lines.push('');
    lines.push('> Key dependency chains: Hook → API → Service');
    lines.push('');
    for (const chain of [...new Set(callChains)].slice(0, 20)) {
      lines.push(chain);
    }
    lines.push('');
  }

  // Error Boundaries
  if (map.errorBoundaries.length > 0) {
    lines.push('## Error Boundaries');
    lines.push('');
    lines.push('| Scope | File | Type |');
    lines.push('|-------|------|------|');
    for (const e of map.errorBoundaries) {
      lines.push(`| ${e.scope} | \`${e.filePath}\` | ${e.type} |`);
    }
    lines.push('');
  }

  // Import Graph (non-obvious connections)
  if (map.importGraph.length > 0) {
    lines.push('## Import Graph');
    lines.push('');
    lines.push('> Connections between routes, hooks, and services');
    lines.push('');
    for (const edge of map.importGraph.slice(0, 30)) {
      lines.push(`- \`${edge.from}\` → \`${edge.to}\` (${edge.symbols.slice(0, 3).join(', ')})`);
    }
    lines.push('');
  }

  // Exports section (for Module Index extraction)
  lines.push('## Exports');
  for (const r of map.apiRoutes.slice(0, 10)) {
    lines.push(`- \`${r.methods.join(', ')} ${r.path}\``);
  }
  for (const h of map.hooks.slice(0, 10)) {
    lines.push(`- \`${h.name}()\``);
  }
  for (const s of map.services.slice(0, 5)) {
    for (const exp of s.exports.slice(0, 3)) {
      lines.push(`- \`${s.name}.${exp}()\``);
    }
  }
  lines.push('');

  return lines.join('\n');
}
