import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { logger } from '../utils/logger.js';

const IMPECCABLE_REPO = 'https://raw.githubusercontent.com/pbakaus/impeccable/main';

/**
 * Find the Impeccable project if cloned locally.
 */
export function findImpeccableDir(): string | null {
  const candidates = [
    join(process.cwd(), '..', 'impeccable'),
    join(process.cwd(), '..', '..', 'impeccable'),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'source', 'skills'))) return c;
  }
  return null;
}

/**
 * List available Impeccable skills.
 */
export async function listImpeccableSkills(): Promise<{ name: string; description: string }[]> {
  const dir = findImpeccableDir();
  if (!dir) return [];

  const skillsDir = join(dir, 'source', 'skills');
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const skills: { name: string; description: string }[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(skillsDir, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    try {
      const content = await readFile(skillFile, 'utf-8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const descMatch = fmMatch[1].match(/description:\s*"?([^"\n]+)"?/);
        skills.push({
          name: entry.name,
          description: descMatch ? descMatch[1].trim() : entry.name,
        });
      } else {
        // No frontmatter — use directory name as description
        skills.push({ name: entry.name, description: entry.name });
      }
    } catch { /* skip */ }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Install Impeccable skills into a project's .claude/skills/ directory.
 * This copies the skill files in Impeccable's native format.
 */
export async function installImpeccableSkills(
  projectRoot: string,
  skillNames?: string[], // if null, install all
): Promise<{ installed: number; details: { name: string; refCount: number }[] }> {
  const impDir = findImpeccableDir();
  if (!impDir) {
    logger.warn('Impeccable not found. Clone it: git clone https://github.com/pbakaus/impeccable.git');
    return { installed: 0, details: [] };
  }

  const skillsDir = join(impDir, 'source', 'skills');
  const targetDir = join(projectRoot, '.claude', 'skills');
  await mkdir(targetDir, { recursive: true });

  const allSkills = await readdir(skillsDir, { withFileTypes: true });
  let installed = 0;
  const details: { name: string; refCount: number }[] = [];

  for (const entry of allSkills) {
    if (!entry.isDirectory()) continue;
    if (skillNames && !skillNames.includes(entry.name)) continue;

    const srcSkill = join(skillsDir, entry.name, 'SKILL.md');
    if (!existsSync(srcSkill)) continue;

    // Copy SKILL.md
    const destSkillDir = join(targetDir, entry.name);
    await mkdir(destSkillDir, { recursive: true });
    const content = await readFile(srcSkill, 'utf-8');
    // Remove provider-specific placeholders — use Claude defaults
    const cleaned = content
      .replace(/\{\{model\}\}/g, 'Claude')
      .replace(/\{\{config_file\}\}/g, 'CLAUDE.md')
      .replace(/\{\{command_prefix\}\}/g, '/')
      .replace(/\{\{ask_instruction\}\}/g, 'Ask the user');
    await writeFile(join(destSkillDir, 'SKILL.md'), cleaned, 'utf-8');

    // Copy reference files if they exist
    let refCount = 0;
    const refDir = join(skillsDir, entry.name, 'reference');
    if (existsSync(refDir)) {
      const destRefDir = join(destSkillDir, 'reference');
      await mkdir(destRefDir, { recursive: true });
      const refs = await readdir(refDir, { withFileTypes: true });
      for (const ref of refs) {
        if (ref.isFile() && ref.name.endsWith('.md')) {
          const refContent = await readFile(join(refDir, ref.name), 'utf-8');
          await writeFile(join(destRefDir, ref.name), refContent, 'utf-8');
          refCount++;
        }
      }
    }

    details.push({ name: entry.name, refCount });
    installed++;
  }

  return { installed, details };
}
