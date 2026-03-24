import { readFile, stat } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import type { AgentCtxConfig } from './config.js';

export interface ContextModule {
  title: string;
  filename: string;
  content: string;
  lastModified: Date;
}

function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) {
    return match[1].trim();
  }
  const name = basename(filename, extname(filename));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export async function loadContextModules(
  config: AgentCtxConfig,
  basePath: string,
): Promise<ContextModule[]> {
  const modules: ContextModule[] = [];

  for (const relativePath of config.context) {
    const fullPath = resolve(basePath, relativePath);
    const filename = basename(relativePath);

    let content: string;
    try {
      content = await readFile(fullPath, 'utf-8');
    } catch (err) {
      throw new Error(
        `Context file not found: ${relativePath} (resolved to ${fullPath})`,
      );
    }

    const fileStat = await stat(fullPath);

    modules.push({
      title: extractTitle(content, filename),
      filename,
      content,
      lastModified: fileStat.mtime,
    });
  }

  return modules;
}
