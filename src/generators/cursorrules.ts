import type { ContextModule } from '../core/context.js';
import type { AgentCtxConfig } from '../core/config.js';

/**
 * Cursor .mdc format — uses YAML frontmatter with description, globs, alwaysApply.
 * Output path: .cursor/rules/agentctx.mdc
 */
export function generateCursorrules(
  _modules: ContextModule[],
  config: AgentCtxConfig,
): string {
  const desc = `${config.project.name} project conventions via agentctx`;

  const parts: string[] = [
    '---',
    `description: "${desc}"`,
    'globs: ""',
    'alwaysApply: true',
    '---',
    '',
    `# ${config.project.name}`,
    '',
  ];

  const meta: string[] = [];
  if (config.project.language) meta.push(config.project.language);
  if (config.project.framework) meta.push(config.project.framework);
  if (config.agent) meta.push(`Agent: ${config.agent}`);
  if (meta.length > 0) parts.push(meta.join(' | '), '');

  parts.push('Context lives in `.agentctx/context/`. Read files based on what you need:');
  parts.push('');
  parts.push('- `conventions/*.md` — code patterns (read Quick Rules section first)');
  parts.push('- `modules/*.md` — what code exists (check before creating new)');
  parts.push('- `agents/*.md` — agent personality');
  parts.push('- `architecture.md` — where to put new files');
  parts.push('- `decisions.md` — past decisions');
  parts.push('- `references/*.md` — syntax quick references');
  parts.push('');
  parts.push('Before writing code: check modules/ for existing exports, read conventions/');
  parts.push('After implementing: update modules/{feature}.md, log decisions, update status');
  parts.push('New feature? Suggest /spec first');

  return parts.join('\n') + '\n';
}
