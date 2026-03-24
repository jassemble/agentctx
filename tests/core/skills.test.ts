import { describe, it, expect, vi } from 'vitest';
import { resolve, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { readFileSync } from 'node:fs';
import {
  SkillYamlSchema,
  resolveSkill,
  resolveSkills,
  loadSkillModules,
  composeSkills,
  type ResolvedSkill,
} from '../../src/core/skills';

const FIXTURES_SKILLS = resolve(__dirname, '../fixtures/skills');

function loadFixtureSkill(name: string): ResolvedSkill {
  const dir = join(FIXTURES_SKILLS, name);
  const raw = parseYaml(readFileSync(join(dir, 'skill.yaml'), 'utf-8'));
  const yaml = SkillYamlSchema.parse(raw);
  return { yaml, dir };
}

describe('SkillYamlSchema', () => {
  it('parses a valid skill.yaml', () => {
    const raw = parseYaml(
      readFileSync(join(FIXTURES_SKILLS, 'test-skill-a', 'skill.yaml'), 'utf-8'),
    );
    const result = SkillYamlSchema.parse(raw);
    expect(result.name).toBe('test-skill-a');
    expect(result.description).toBe('A test skill for unit tests');
    expect(result.version).toBe('1.0.0');
    expect(result.context).toEqual(['context/principles.md']);
    expect(result.tags).toEqual(['testing']);
  });

  it('rejects names with invalid characters', () => {
    expect(() =>
      SkillYamlSchema.parse({
        name: 'Invalid Name!',
        description: 'bad',
        version: '1.0.0',
        context: [],
      }),
    ).toThrow();
  });
});

describe('resolveSkill', () => {
  it('resolves a built-in skill by name', async () => {
    const skill = await resolveSkill('test-skill-a', FIXTURES_SKILLS);
    expect(skill.yaml.name).toBe('test-skill-a');
    expect(skill.dir).toBe(join(FIXTURES_SKILLS, 'test-skill-a'));
  });

  it('throws for unknown skill with helpful message', async () => {
    await expect(resolveSkill('nonexistent', FIXTURES_SKILLS)).rejects.toThrow(
      /Skill "nonexistent" not found/,
    );
  });
});

describe('resolveSkills', () => {
  it('resolves multiple skills', async () => {
    const skills = await resolveSkills(['test-skill-a', 'test-skill-b'], FIXTURES_SKILLS);
    expect(skills).toHaveLength(2);
    expect(skills[0].yaml.name).toBe('test-skill-a');
    expect(skills[1].yaml.name).toBe('test-skill-b');
  });

  it('throws on conflict', async () => {
    await expect(
      resolveSkills(['test-skill-a', 'test-skill-conflict'], FIXTURES_SKILLS),
    ).rejects.toThrow(/Skill conflict.*test-skill-conflict.*conflicts with.*test-skill-a/);
  });
});

describe('loadSkillModules', () => {
  it('loads context files as modules', async () => {
    const skill = loadFixtureSkill('test-skill-a');
    const modules = await loadSkillModules(skill);

    expect(modules).toHaveLength(1);
    expect(modules[0].filename).toBe('principles.md');
    expect(modules[0].title).toBe('Principles');
    expect(modules[0].content).toContain('SOLID principles');
    expect(modules[0].source).toBe('test-skill-a');
  });

  it('throws for missing context file', async () => {
    const skill: ResolvedSkill = {
      yaml: {
        name: 'broken',
        description: 'broken',
        version: '1.0.0',
        tags: [],
        provides: [],
        conflicts: [],
        context: ['context/missing.md'],
      },
      dir: join(FIXTURES_SKILLS, 'test-skill-a'),
    };

    await expect(loadSkillModules(skill)).rejects.toThrow(
      /Skill context file not found/,
    );
  });
});

describe('composeSkills', () => {
  it('merges modules from multiple skills', async () => {
    const skillA = loadFixtureSkill('test-skill-a');
    const skillB = loadFixtureSkill('test-skill-b');

    const result = await composeSkills([skillA, skillB]);

    expect(result.skillNames).toEqual(['test-skill-a', 'test-skill-b']);
    expect(result.files).toHaveLength(2);

    const filenames = result.files.map((f) => f.relativePath);
    expect(filenames).toContain('principles.md');
    expect(filenames).toContain('style.md');
  });

  it('last skill wins on duplicate filename', async () => {
    const skillA = loadFixtureSkill('test-skill-a');
    const skillDup = loadFixtureSkill('test-skill-b-dup');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await composeSkills([skillA, skillDup]);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].relativePath).toBe('principles.md');
    expect(result.files[0].content).toContain('Overridden Principles');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('overrides file "principles.md"'),
    );

    warnSpy.mockRestore();
  });
});
