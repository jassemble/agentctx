import { logger } from '../utils/logger.js';
import {
  findImpeccableDir,
  listImpeccableSkills,
  installImpeccableSkills,
} from '../core/impeccable.js';

export async function impeccableCommand(action: string, name?: string): Promise<void> {
  switch (action) {
    case 'list':
      await listAction();
      break;
    case 'install':
      await installAction(name);
      break;
    default:
      logger.error(`Unknown action: ${action}`);
      logger.dim('Available actions: list, install [name]');
      process.exit(1);
  }
}

async function listAction(): Promise<void> {
  const skills = await listImpeccableSkills();

  if (skills.length === 0) {
    const dir = findImpeccableDir();
    if (!dir) {
      console.log('');
      logger.warn('Impeccable not found locally.');
      console.log('');
      console.log('  Clone it alongside this project:');
      console.log('    git clone https://github.com/pbakaus/impeccable.git');
      console.log('');
      console.log('  Expected location: ../impeccable/ (relative to project root)');
      console.log('');
    } else {
      logger.warn('No Impeccable skills found in the cloned repo.');
    }
    return;
  }

  console.log('');
  console.log('Impeccable Design Skills (impeccable.style)');
  console.log('');

  for (const skill of skills) {
    const namePadded = skill.name.padEnd(24);
    const desc = skill.description.length > 55
      ? skill.description.slice(0, 52) + '...'
      : skill.description;
    console.log(`  ${namePadded}${desc}`);
  }

  console.log('');
  console.log('  Install all: agentctx impeccable install');
  console.log('  Install one: agentctx impeccable install <name>');
  console.log('');
}

async function installAction(name?: string): Promise<void> {
  const projectRoot = process.cwd();
  const skillNames = name ? [name] : undefined;

  console.log('');
  console.log('Installing Impeccable skills to .claude/skills/...');

  const { installed, details } = await installImpeccableSkills(projectRoot, skillNames);

  if (installed === 0) {
    if (name) {
      logger.error(`Skill "${name}" not found in Impeccable.`);
      logger.dim('Run `agentctx impeccable list` to see available skills.');
    }
    return;
  }

  for (const detail of details) {
    const refInfo = detail.refCount > 0 ? ` (+ ${detail.refCount} reference files)` : '';
    logger.success(`${detail.name}${refInfo}`);
  }

  console.log('');
  console.log(`  Installed ${installed} skill${installed === 1 ? '' : 's'}.`);
  console.log('');

  // Show usage hint with some example skill names
  const examples = details.slice(0, 3).map(d => `/${d.name}`).join(', ');
  if (examples) {
    console.log(`  Use ${examples} etc. in Claude Code.`);
    console.log('');
  }
}
