import { z } from 'zod';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, basename, extname, join, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

export const SkillYamlSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string(),
  version: z.string(),
  language: z.string().optional(),
  tags: z.array(z.string()).default([]),
  provides: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  context: z.array(z.string()),
  commands: z.array(z.string()).default([]),
  scaffolds: z.array(z.object({
    src: z.string(),
    dest: z.string(),
  })).default([]),
});

export type SkillYaml = z.infer<typeof SkillYamlSchema>;

export interface ResolvedSkill {
  yaml: SkillYaml;
  dir: string;
}

export interface SkillModule {
  filename: string;
  title: string;
  content: string;
  source: string;
}

export function getBuiltinSkillsDir(): string {
  // In dev (tsx): src/core/skills.ts → ../../skills
  const devPath = join(dirname(__filename), '..', '..', 'skills');
  if (existsSync(devPath)) return devPath;

  // After build (tsup): dist/index.js → ../skills
  const distPath = join(dirname(__filename), '..', 'skills');
  if (existsSync(distPath)) return distPath;

  return devPath; // fallback — will fail later with clear error
}

export async function resolveSkill(name: string, builtinOverride?: string): Promise<ResolvedSkill> {
  const skillsRoot = builtinOverride ?? getBuiltinSkillsDir();

  // 1. Check built-in skills
  const builtinDir = join(skillsRoot, name);
  const builtinYaml = join(builtinDir, 'skill.yaml');
  if (existsSync(builtinYaml)) {
    const content = await readFile(builtinYaml, 'utf-8');
    const raw = parseYaml(content);
    const yaml = SkillYamlSchema.parse(raw);
    return { yaml, dir: builtinDir };
  }

  // 2. Check local project skills
  const localDir = join(process.cwd(), '.agentctx', 'skills', name);
  const localYaml = join(localDir, 'skill.yaml');
  if (existsSync(localYaml)) {
    const content = await readFile(localYaml, 'utf-8');
    const raw = parseYaml(content);
    const yaml = SkillYamlSchema.parse(raw);
    return { yaml, dir: localDir };
  }

  // 3. List available skills for helpful error
  const available: string[] = [];
  if (existsSync(skillsRoot)) {
    const entries = await readdir(skillsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && existsSync(join(skillsRoot, entry.name, 'skill.yaml'))) {
        available.push(entry.name);
      }
    }
  }

  const hint = available.length > 0
    ? ` Available built-in skills: ${available.join(', ')}`
    : '';
  throw new Error(`Skill "${name}" not found.${hint}`);
}

export async function resolveSkills(names: string[], builtinOverride?: string): Promise<ResolvedSkill[]> {
  const skills = await Promise.all(names.map((n) => resolveSkill(n, builtinOverride)));

  // Check for conflicts
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const a = skills[i];
      const b = skills[j];
      if (a.yaml.conflicts.includes(b.yaml.name)) {
        throw new Error(
          `Skill conflict: "${a.yaml.name}" conflicts with "${b.yaml.name}"`,
        );
      }
      if (b.yaml.conflicts.includes(a.yaml.name)) {
        throw new Error(
          `Skill conflict: "${b.yaml.name}" conflicts with "${a.yaml.name}"`,
        );
      }
    }
  }

  return skills;
}

function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) {
    return match[1].trim();
  }
  const name = basename(filename, extname(filename));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export async function loadSkillModules(skill: ResolvedSkill): Promise<SkillModule[]> {
  const modules: SkillModule[] = [];

  for (const relativePath of skill.yaml.context) {
    const fullPath = resolve(skill.dir, relativePath);
    const filename = basename(relativePath);

    let content: string;
    try {
      content = await readFile(fullPath, 'utf-8');
    } catch {
      throw new Error(
        `Skill context file not found: ${relativePath} in skill "${skill.yaml.name}" (resolved to ${fullPath})`,
      );
    }

    modules.push({
      filename,
      title: extractTitle(content, filename),
      content,
      source: skill.yaml.name,
    });
  }

  return modules;
}

export async function composeSkills(
  skills: ResolvedSkill[],
): Promise<{
  files: Array<{ relativePath: string; content: string }>;
  commands: Array<{ relativePath: string; content: string }>;
  scaffolds: Array<{ dest: string; content: string }>;
  skillNames: string[];
}> {
  const fileMap = new Map<string, { relativePath: string; content: string }>();
  const commands: Array<{ relativePath: string; content: string }> = [];
  const scaffolds: Array<{ dest: string; content: string }> = [];

  for (const skill of skills) {
    const modules = await loadSkillModules(skill);
    for (const mod of modules) {
      if (fileMap.has(mod.filename)) {
        console.warn(
          `Skill "${mod.source}" overrides file "${mod.filename}" from a previous skill`,
        );
      }
      fileMap.set(mod.filename, {
        relativePath: mod.filename,
        content: mod.content,
      });
    }

    // Load command files
    for (const cmdPath of skill.yaml.commands) {
      const fullPath = resolve(skill.dir, cmdPath);
      const filename = basename(cmdPath);
      let content: string;
      try {
        content = await readFile(fullPath, 'utf-8');
      } catch {
        throw new Error(
          `Skill command file not found: ${cmdPath} in skill "${skill.yaml.name}" (resolved to ${fullPath})`,
        );
      }
      commands.push({ relativePath: filename, content });
    }

    // Load scaffold files
    for (const scaffold of skill.yaml.scaffolds) {
      const fullPath = resolve(skill.dir, scaffold.src);
      let content: string;
      try {
        content = await readFile(fullPath, 'utf-8');
      } catch {
        throw new Error(
          `Skill scaffold file not found: ${scaffold.src} in skill "${skill.yaml.name}" (resolved to ${fullPath})`,
        );
      }
      scaffolds.push({ dest: scaffold.dest, content });
    }
  }

  return {
    files: Array.from(fileMap.values()),
    commands,
    scaffolds,
    skillNames: skills.map((s) => s.yaml.name),
  };
}

export async function listBuiltinSkills(): Promise<SkillYaml[]> {
  const skillsDir = getBuiltinSkillsDir();
  if (!existsSync(skillsDir)) return [];

  const entries = await readdir(skillsDir, { withFileTypes: true });
  const skills: SkillYaml[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const yamlPath = join(skillsDir, entry.name, 'skill.yaml');
    if (!existsSync(yamlPath)) continue;

    const content = await readFile(yamlPath, 'utf-8');
    const raw = parseYaml(content);
    try {
      skills.push(SkillYamlSchema.parse(raw));
    } catch {
      // Skip invalid skill files
    }
  }

  return skills;
}
