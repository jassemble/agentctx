import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

// ── Types ──────────────────────────────────────────────────────────────

export interface FileAnalysis {
  filePath: string;
  directives: string[];
  exports: ExportedSymbol[];
  imports: ImportDecl[];
  types: TypeDecl[];
  functions: FunctionSig[];
  components: ComponentDecl[];
  hooks: HookUsage[];
}

export interface ExportedSymbol {
  name: string;
  kind: 'function' | 'type' | 'interface' | 'enum' | 'const' | 'component';
}

export interface ImportDecl {
  from: string;
  symbols: string[];
  isTypeOnly: boolean;
}

export interface TypeDecl {
  name: string;
  kind: 'interface' | 'type' | 'enum';
  signature: string;
  exported: boolean;
}

export interface FunctionSig {
  name: string;
  params: string;
  returnType: string;
  isAsync: boolean;
  exported: boolean;
  jsdoc?: string;
}

export interface ComponentDecl {
  name: string;
  props: string | null;
  hooks: string[];
}

export interface HookUsage {
  name: string;
  source: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

function printNode(node: ts.Node, sourceFile: ts.SourceFile): string {
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).replace(/\n/g, ' ').trim();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  return mods?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function isDefaultExport(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  return mods?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
}

function getJsDocSummary(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const fullText = sourceFile.getFullText();
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
  if (!ranges) return undefined;

  for (const range of ranges) {
    const text = fullText.slice(range.pos, range.end);
    if (text.startsWith('/**')) {
      // Extract first meaningful line
      const lines = text
        .replace(/^\/\*\*\s*/, '')
        .replace(/\s*\*\/$/, '')
        .split('\n')
        .map(l => l.replace(/^\s*\*\s?/, '').trim())
        .filter(l => l && !l.startsWith('@'));
      if (lines.length > 0) return truncate(lines[0], 100);
    }
  }
  return undefined;
}

function formatParams(node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction, sf: ts.SourceFile): string {
  const params = node.parameters.map(p => {
    const name = p.name.getText(sf);
    const type = p.type ? printNode(p.type, sf) : 'any';
    const optional = p.questionToken ? '?' : '';
    return `${name}${optional}: ${type}`;
  });
  return `(${params.join(', ')})`;
}

function getReturnType(node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction, sf: ts.SourceFile): string {
  if (node.type) return printNode(node.type, sf);
  return 'void';
}

function containsJsx(node: ts.Node): boolean {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
    return true;
  }
  return ts.forEachChild(node, containsJsx) ?? false;
}

function findHookCalls(node: ts.Node, sf: ts.SourceFile): string[] {
  const hooks: string[] = [];

  function walk(n: ts.Node): void {
    if (ts.isCallExpression(n)) {
      const text = n.expression.getText(sf);
      if (/^use[A-Z]/.test(text)) {
        hooks.push(text);
      }
    }
    ts.forEachChild(n, walk);
  }

  walk(node);
  return [...new Set(hooks)];
}

function extractPropsType(node: ts.FunctionDeclaration | ts.ArrowFunction, sf: ts.SourceFile): string | null {
  const firstParam = node.parameters[0];
  if (!firstParam) return null;

  if (firstParam.type) {
    const printed = printNode(firstParam.type, sf);
    return truncate(printed, 200);
  }
  return null;
}

// ── Main Analyzer ──────────────────────────────────────────────────────

export function analyzeFile(filePath: string, content?: string): FileAnalysis {
  const source = content ?? readFileSync(filePath, 'utf-8');
  const isTsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');

  const sf = ts.createSourceFile(
    basename(filePath),
    source,
    ts.ScriptTarget.Latest,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const result: FileAnalysis = {
    filePath,
    directives: [],
    exports: [],
    imports: [],
    types: [],
    functions: [],
    components: [],
    hooks: [],
  };

  // ── Detect framework directives ──
  // "use server", "use client" are expression statements with string literals at top of file
  // import "server-only" is a side-effect import
  const KNOWN_DIRECTIVES = new Set(['use server', 'use client']);

  // Build import map for hook source resolution
  const importMap = new Map<string, string>();

  ts.forEachChild(sf, (node) => {
    // ── Directives ──
    if (ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression)) {
      const text = node.expression.text;
      if (KNOWN_DIRECTIVES.has(text)) {
        result.directives.push(text);
      }
      return;
    }

    // ── Imports ──
    if (ts.isImportDeclaration(node)) {
      const moduleSpec = (node.moduleSpecifier as ts.StringLiteral).text;
      // Detect side-effect imports that act as directives (e.g., import "server-only")
      if (!node.importClause && (moduleSpec === 'server-only' || moduleSpec === 'client-only')) {
        result.directives.push(moduleSpec);
      }
      const isTypeOnly = node.importClause?.isTypeOnly ?? false;
      const symbols: string[] = [];

      if (node.importClause) {
        if (node.importClause.name) {
          symbols.push(node.importClause.name.text);
          importMap.set(node.importClause.name.text, moduleSpec);
        }
        const bindings = node.importClause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) {
            symbols.push(el.name.text);
            importMap.set(el.name.text, moduleSpec);
          }
        }
        if (bindings && ts.isNamespaceImport(bindings)) {
          symbols.push(`* as ${bindings.name.text}`);
          importMap.set(bindings.name.text, moduleSpec);
        }
      }

      result.imports.push({ from: moduleSpec, symbols, isTypeOnly });
      return;
    }

    // ── Type declarations ──
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.text;
      const exported = hasExportModifier(node);
      const sig = truncate(printNode(node, sf), 200);
      result.types.push({ name, kind: 'interface', signature: sig, exported });
      if (exported) result.exports.push({ name, kind: 'interface' });
      return;
    }

    if (ts.isTypeAliasDeclaration(node)) {
      const name = node.name.text;
      const exported = hasExportModifier(node);
      const sig = truncate(printNode(node, sf), 200);
      result.types.push({ name, kind: 'type', signature: sig, exported });
      if (exported) result.exports.push({ name, kind: 'type' });
      return;
    }

    if (ts.isEnumDeclaration(node)) {
      const name = node.name.text;
      const exported = hasExportModifier(node);
      const members = node.members.map(m => m.name.getText(sf)).slice(0, 5);
      const sig = `enum ${name} { ${members.join(', ')}${node.members.length > 5 ? ', ...' : ''} }`;
      result.types.push({ name, kind: 'enum', signature: sig, exported });
      if (exported) result.exports.push({ name, kind: 'enum' });
      return;
    }

    // ── Function declarations ──
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const exported = hasExportModifier(node);
      const isAsync = node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
      const params = formatParams(node, sf);
      const returnType = getReturnType(node, sf);
      const jsdoc = getJsDocSummary(node, sf);

      // Check if it's a React component (returns JSX, PascalCase name)
      if (exported && /^[A-Z]/.test(name) && node.body && containsJsx(node.body)) {
        const props = extractPropsType(node, sf);
        const hookCalls = findHookCalls(node.body, sf);
        result.components.push({ name, props, hooks: hookCalls });
        result.exports.push({ name, kind: 'component' });

        // Record hook usages
        for (const h of hookCalls) {
          result.hooks.push({ name: h, source: importMap.get(h) ?? 'local' });
        }
        return;
      }

      result.functions.push({ name, params, returnType, isAsync, exported, jsdoc });
      if (exported) result.exports.push({ name, kind: 'function' });
      return;
    }

    // ── Variable declarations (const arrow functions, exported consts) ──
    if (ts.isVariableStatement(node)) {
      const exported = hasExportModifier(node);
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const name = decl.name.text;

        if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
          const fn = decl.initializer as ts.ArrowFunction;
          const isAsync = fn.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
          const params = formatParams(fn, sf);
          const returnType = getReturnType(fn, sf);
          const jsdoc = getJsDocSummary(node, sf);

          // React component check
          if (exported && /^[A-Z]/.test(name) && fn.body && containsJsx(fn.body)) {
            const props = extractPropsType(fn, sf);
            const hookCalls = findHookCalls(fn.body, sf);
            result.components.push({ name, props, hooks: hookCalls });
            result.exports.push({ name, kind: 'component' });

            for (const h of hookCalls) {
              result.hooks.push({ name: h, source: importMap.get(h) ?? 'local' });
            }
            continue;
          }

          // Custom hook check (use* pattern)
          if (exported && /^use[A-Z]/.test(name)) {
            result.functions.push({ name, params, returnType, isAsync, exported, jsdoc });
            result.exports.push({ name, kind: 'function' });
            continue;
          }

          result.functions.push({ name, params, returnType, isAsync, exported, jsdoc });
          if (exported) result.exports.push({ name, kind: 'function' });
        } else if (exported) {
          // Exported const (non-function)
          result.exports.push({ name, kind: 'const' });
        }
      }
      return;
    }

    // ── Export assignments (export default) ──
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      const expr = node.expression;
      if (ts.isIdentifier(expr)) {
        result.exports.push({ name: expr.text, kind: 'function' });
      }
      return;
    }
  });

  // Deduplicate hooks
  const seenHooks = new Set<string>();
  result.hooks = result.hooks.filter(h => {
    if (seenHooks.has(h.name)) return false;
    seenHooks.add(h.name);
    return true;
  });

  return result;
}
