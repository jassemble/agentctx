import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import type { FeatureBoundary, FeatureMap } from './feature-discovery.js';
import type { FileAnalysis, ImportDecl } from './ast-analyzer.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface AssembleOptions {
  maxTypes?: number;
  maxFunctions?: number;
  maxComponents?: number;
  maxKeyFiles?: number;
}

const DEFAULTS: Required<AssembleOptions> = {
  maxTypes: 8,
  maxFunctions: 10,
  maxComponents: 5,
  maxKeyFiles: 8,
};

// ── Staleness Hash ─────────────────────────────────────────────────────

export function computeSourceHash(root: string, files: string[]): string {
  const sorted = [...files].sort();
  const mtimes = sorted.map(f => {
    try {
      return statSync(join(root, f)).mtimeMs.toString();
    } catch {
      return '0';
    }
  });
  return createHash('md5').update(mtimes.join(':')).digest('hex').slice(0, 8);
}

// ── Cross-Feature Dependency Resolution ────────────────────────────────

interface CrossFeatureDeps {
  importsFrom: Set<string>;
  importedBy: Set<string>;
}

export function buildCrossFeatureDeps(
  feature: FeatureBoundary,
  featureAnalyses: FileAnalysis[],
  allFeatures: FeatureBoundary[],
  allAnalyses: FileAnalysis[],
): CrossFeatureDeps {
  const importsFrom = new Set<string>();
  const importedBy = new Set<string>();

  // Build file → feature index
  const fileToFeature = new Map<string, string>();
  for (const f of allFeatures) {
    for (const file of f.files) {
      fileToFeature.set(file, f.name);
    }
  }

  // Collect all import specifiers from this feature's files
  const thisFeatureFiles = new Set(feature.files);

  for (const analysis of featureAnalyses) {
    for (const imp of analysis.imports) {
      // Try to match import source to a feature file
      // This is approximate — we check if any feature file basename matches
      const matchedFeature = findFeatureForImport(imp, allFeatures, thisFeatureFiles);
      if (matchedFeature && matchedFeature !== feature.name) {
        importsFrom.add(matchedFeature);
      }
    }
  }

  // Find features that import from this feature
  for (const analysis of allAnalyses) {
    if (thisFeatureFiles.has(analysis.filePath)) continue;

    for (const imp of analysis.imports) {
      // Check if import points to a file in this feature
      if (importsResolveToFeature(imp, feature)) {
        const importerFeature = fileToFeature.get(analysis.filePath);
        if (importerFeature && importerFeature !== feature.name) {
          importedBy.add(importerFeature);
        }
      }
    }
  }

  return { importsFrom, importedBy };
}

function findFeatureForImport(
  imp: ImportDecl,
  allFeatures: FeatureBoundary[],
  excludeFiles: Set<string>,
): string | null {
  const source = imp.from;
  // Skip external packages
  if (!source.startsWith('.') && !source.startsWith('@/') && !source.startsWith('~/')) {
    return null;
  }

  for (const feature of allFeatures) {
    for (const file of feature.files) {
      if (excludeFiles.has(file)) continue;
      // Check if the import path could resolve to this file
      if (importCouldResolve(source, file)) {
        return feature.name;
      }
    }
  }
  return null;
}

function importsResolveToFeature(imp: ImportDecl, feature: FeatureBoundary): boolean {
  const source = imp.from;
  if (!source.startsWith('.') && !source.startsWith('@/') && !source.startsWith('~/')) {
    return false;
  }
  return feature.files.some(file => importCouldResolve(source, file));
}

function importCouldResolve(importSource: string, filePath: string): boolean {
  // Normalize: strip @/ or ~/ prefix, strip extension
  let normalized = importSource.replace(/^[@~]\//, '');
  // Remove file extension if present
  normalized = normalized.replace(/\.(ts|tsx|js|jsx)$/, '');

  const fileNoExt = filePath.replace(/\.(ts|tsx|js|jsx)$/, '');
  const fileNoIndex = fileNoExt.replace(/\/index$/, '');

  return normalized === fileNoExt
    || normalized === fileNoIndex
    || fileNoExt.endsWith(normalized)
    || fileNoIndex.endsWith(normalized);
}

// ── Module Markdown Assembly ───────────────────────────────────────────

export function assembleModule(
  feature: FeatureBoundary,
  featureAnalyses: FileAnalysis[],
  allFeatures: FeatureBoundary[],
  allAnalyses: FileAnalysis[],
  root: string,
  options?: AssembleOptions,
): string {
  const opts = { ...DEFAULTS, ...options };
  const lines: string[] = [];

  // ── Frontmatter ──
  const now = new Date().toISOString();
  const sourceHash = computeSourceHash(root, feature.files);

  lines.push('---');
  lines.push('generated-by: agentctx-scan');
  lines.push(`generated-at: ${now}`);
  lines.push('source-files:');
  for (const f of feature.files.slice(0, 20)) {
    lines.push(`  - ${f}`);
  }
  if (feature.files.length > 20) {
    lines.push(`  # ... and ${feature.files.length - 20} more`);
  }
  lines.push(`source-hash: ${sourceHash}`);
  lines.push('---');

  // ── Title ──
  const title = feature.name.charAt(0).toUpperCase() + feature.name.slice(1).replace(/-./g, m => ' ' + m[1].toUpperCase());
  lines.push(`# ${title}`);
  lines.push('');

  // ── Key Files ──
  lines.push('## Key Files');
  const keyFiles = feature.files.slice(0, opts.maxKeyFiles);
  for (const f of keyFiles) {
    const analysis = featureAnalyses.find(a => a.filePath === f);
    const exportCount = analysis?.exports.length ?? 0;
    const desc = exportCount > 0
      ? analysis!.exports.slice(0, 3).map(e => e.name).join(', ')
      : '';
    lines.push(`- \`${f}\`${desc ? ` — ${desc}` : ''}`);
  }
  if (feature.files.length > opts.maxKeyFiles) {
    lines.push(`> ${feature.files.length - opts.maxKeyFiles} more files in this feature`);
  }
  lines.push('');

  // ── Types ──
  const allTypes = featureAnalyses.flatMap(a => a.types).filter(t => t.exported);
  if (allTypes.length > 0) {
    lines.push('## Types');
    const displayTypes = allTypes.slice(0, opts.maxTypes);
    for (const t of displayTypes) {
      lines.push(`- \`${t.signature}\``);
    }
    if (allTypes.length > opts.maxTypes) {
      lines.push(`> ${allTypes.length - opts.maxTypes} more types`);
    }
    lines.push('');
  }

  // ── Functions ──
  const allFunctions = featureAnalyses.flatMap(a => a.functions).filter(f => f.exported);
  if (allFunctions.length > 0) {
    lines.push('## Functions');
    const displayFns = allFunctions.slice(0, opts.maxFunctions);
    for (const fn of displayFns) {
      const asyncPrefix = fn.isAsync ? 'async ' : '';
      let line = `- \`${asyncPrefix}${fn.name}${fn.params}: ${fn.returnType}\``;
      if (fn.jsdoc) line += ` — ${fn.jsdoc}`;
      lines.push(line);
    }
    if (allFunctions.length > opts.maxFunctions) {
      lines.push(`> ${allFunctions.length - opts.maxFunctions} more functions`);
    }
    lines.push('');
  }

  // ── Components ──
  const allComponents = featureAnalyses.flatMap(a => a.components);
  if (allComponents.length > 0) {
    lines.push('## Components');
    const displayComps = allComponents.slice(0, opts.maxComponents);
    for (const comp of displayComps) {
      let line = `- \`<${comp.name}`;
      if (comp.props) line += ` props={${comp.props}}`;
      line += '>`';
      if (comp.hooks.length > 0) {
        line += ` — hooks: ${comp.hooks.join(', ')}`;
      }
      lines.push(line);
    }
    if (allComponents.length > opts.maxComponents) {
      lines.push(`> ${allComponents.length - opts.maxComponents} more components`);
    }
    lines.push('');
  }

  // ── Dependencies ──
  const deps = buildCrossFeatureDeps(feature, featureAnalyses, allFeatures, allAnalyses);
  if (deps.importsFrom.size > 0 || deps.importedBy.size > 0) {
    lines.push('## Dependencies');
    if (deps.importsFrom.size > 0) {
      lines.push(`- imports from: ${[...deps.importsFrom].join(', ')}`);
    }
    if (deps.importedBy.size > 0) {
      lines.push(`- imported by: ${[...deps.importedBy].join(', ')}`);
    }
    lines.push('');
  }

  // ── Exports summary ──
  const allExports = featureAnalyses.flatMap(a => a.exports);
  if (allExports.length > 0) {
    lines.push('## Exports');
    const exportNames = [...new Set(allExports.map(e => e.name))];
    lines.push(`- ${exportNames.slice(0, 12).map(e => `\`${e}\``).join(', ')}`);
    if (exportNames.length > 12) {
      lines.push(`> ${exportNames.length - 12} more exports`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Root Module (files at source root: app/layout.tsx, app/page.tsx) ────

export function assembleRootModule(
  rootFiles: string[],
  analyses: FileAnalysis[],
  root: string,
  options?: AssembleOptions,
): string | null {
  if (rootFiles.length === 0) return null;

  const opts = { ...DEFAULTS, ...options };
  const rootAnalyses = analyses.filter(a => rootFiles.includes(a.filePath));

  const totalExports = rootAnalyses.reduce((sum, a) => sum + a.exports.length, 0);
  if (totalExports === 0) return null;

  const lines: string[] = [];

  const now = new Date().toISOString();
  const sourceHash = computeSourceHash(root, rootFiles);

  lines.push('---');
  lines.push('generated-by: agentctx-scan');
  lines.push(`generated-at: ${now}`);
  lines.push('source-files:');
  for (const f of rootFiles.slice(0, 20)) {
    lines.push(`  - ${f}`);
  }
  lines.push(`source-hash: ${sourceHash}`);
  lines.push('---');
  lines.push('# Root');
  lines.push('');
  lines.push('> Root-level files (layouts, pages, middleware).');
  lines.push('');

  lines.push('## Key Files');
  for (const f of rootFiles.slice(0, opts.maxKeyFiles)) {
    const analysis = rootAnalyses.find(a => a.filePath === f);
    const desc = analysis?.exports.slice(0, 3).map(e => e.name).join(', ') ?? '';
    lines.push(`- \`${f}\`${desc ? ` — ${desc}` : ''}`);
  }
  lines.push('');

  const allTypes = rootAnalyses.flatMap(a => a.types).filter(t => t.exported);
  if (allTypes.length > 0) {
    lines.push('## Types');
    for (const t of allTypes.slice(0, opts.maxTypes)) {
      lines.push(`- \`${t.signature}\``);
    }
    lines.push('');
  }

  const allFunctions = rootAnalyses.flatMap(a => a.functions).filter(f => f.exported);
  if (allFunctions.length > 0) {
    lines.push('## Functions');
    for (const fn of allFunctions.slice(0, opts.maxFunctions)) {
      const asyncPrefix = fn.isAsync ? 'async ' : '';
      lines.push(`- \`${asyncPrefix}${fn.name}${fn.params}: ${fn.returnType}\``);
    }
    lines.push('');
  }

  const allExports = rootAnalyses.flatMap(a => a.exports);
  if (allExports.length > 0) {
    lines.push('## Exports');
    const names = [...new Set(allExports.map(e => e.name))];
    lines.push(`- ${names.slice(0, 12).map(e => `\`${e}\``).join(', ')}`);
    lines.push('');
  }

  return lines.join('\n');
}
