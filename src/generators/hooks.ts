import type { ContextModule } from '../core/context.js';
import type { AgentCtxConfig } from '../core/config.js';
import type { HookEntry } from '../core/skills.js';

// Hooks are composed during skill resolution — this generator receives them
// via a side channel (hookEntries) since the standard generator signature
// only passes modules + config.

let _hookEntries: HookEntry[] = [];

export function setHookEntries(entries: HookEntry[]): void {
  _hookEntries = entries;
}

interface HookConfig {
  matcher?: string;
  command: string;
  timeout: number;
}

interface HooksOutput {
  hooks: Record<string, HookConfig[]>;
}

export function generateHooks(
  _modules: ContextModule[],
  _config: AgentCtxConfig,
): string {
  const output: HooksOutput = { hooks: {} };

  for (const entry of _hookEntries) {
    const event = entry.event;
    if (!output.hooks[event]) {
      output.hooks[event] = [];
    }

    const hookConfig: HookConfig = {
      command: `node .agentctx/${entry.scriptPath}`,
      timeout: entry.timeout,
    };

    if (entry.matcher) {
      hookConfig.matcher = entry.matcher;
    }

    output.hooks[event].push(hookConfig);
  }

  return JSON.stringify(output, null, 2) + '\n';
}

/**
 * Returns the hook script files that need to be written to disk.
 * Called separately from the generator since scripts are binary content,
 * not part of the settings JSON output.
 */
export function getHookScripts(): Array<{ path: string; content: string }> {
  return _hookEntries.map(entry => ({
    path: entry.scriptPath,
    content: entry.content,
  }));
}
