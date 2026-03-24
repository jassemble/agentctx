import { loadConfig, type AgentCtxConfig } from './config.js';
import { loadContextModules, type ContextModule } from './context.js';
import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

export interface ResolvedConfig {
  config: AgentCtxConfig;
  modules: ContextModule[];
  configPath: string;
  agentctxDir: string;
  projectRoot: string;
}

/**
 * Resolve the full config chain walking up from a starting .agentctx/ directory.
 * Returns merged modules from root -> ... -> child.
 */
export async function resolveInheritance(
  configPath: string,
  depth: number = 0,
): Promise<ResolvedConfig> {
  if (depth > 10) {
    throw new Error('Inheritance chain too deep (max 10 levels)');
  }

  const agentctxDir = dirname(configPath);
  const projectRoot = dirname(agentctxDir);
  const config = await loadConfig(configPath);
  const childModules = await loadContextModules(config, agentctxDir);

  if (!config.inherit) {
    return { config, modules: childModules, configPath, agentctxDir, projectRoot };
  }

  // Resolve parent path relative to the project root (parent of .agentctx/)
  const parentAgentctxDir = resolve(projectRoot, config.inherit.from);
  const parentConfigPath = join(parentAgentctxDir, 'config.yaml');

  if (!existsSync(parentConfigPath)) {
    throw new Error(
      `Parent config not found: ${parentConfigPath} (referenced from ${configPath})`,
    );
  }

  const parent = await resolveInheritance(parentConfigPath, depth + 1);
  const strategy = config.inherit.strategy;

  let mergedModules: ContextModule[];

  if (strategy === 'override') {
    mergedModules = childModules;
  } else if (strategy === 'append') {
    mergedModules = [...parent.modules, ...childModules];
  } else {
    // merge (default): parent first, child replaces by filename
    const childFilenames = new Set(childModules.map((m) => m.filename));
    const parentFiltered = parent.modules.filter(
      (m) => !childFilenames.has(m.filename),
    );
    mergedModules = [...parentFiltered, ...childModules];
  }

  // Merge config: child wins on conflicts, but combine skills arrays
  const mergedConfig: AgentCtxConfig = {
    ...parent.config,
    ...config,
    context: mergedModules.map((m) => m.filename),
    skills: [...new Set([...(parent.config.skills || []), ...(config.skills || [])])],
  };

  // Apply exclude — parent sections are excluded, child's own values used instead
  const exclude = config.inherit.exclude || [];
  if (exclude.includes('outputs')) {
    mergedConfig.outputs = config.outputs;
  }
  if (exclude.includes('lint')) {
    mergedConfig.lint = config.lint;
  }
  if (exclude.includes('references')) {
    mergedConfig.references = config.references;
  }

  return {
    config: mergedConfig,
    modules: mergedModules,
    configPath,
    agentctxDir,
    projectRoot,
  };
}
