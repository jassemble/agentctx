import { join, dirname, basename } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stringify as toYaml } from 'yaml';
import { logger } from '../utils/logger.js';
import { findConfigPath, loadConfig } from '../core/config.js';

const execFileAsync = promisify(execFile);

interface TestOptions {
  generate?: boolean;
  ci?: boolean;
}

// ── Extract assertions from convention files ──────────────────────────

interface ConventionRule {
  source: string;      // file path
  section: string;     // Quick Rules, Don't
  rule: string;        // the rule text
  type: 'should' | 'should-not';
}

function extractRules(filePath: string): ConventionRule[] {
  const rules: ConventionRule[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const source = basename(filePath, '.md');
  const lines = content.split('\n');

  let currentSection = '';

  for (const line of lines) {
    if (/^##\s+Quick Rules/i.test(line)) { currentSection = 'Quick Rules'; continue; }
    if (/^##\s+Don't/i.test(line)) { currentSection = "Don't"; continue; }
    if (/^##\s+/.test(line)) { currentSection = ''; continue; }

    if (currentSection && line.startsWith('- ')) {
      const rule = line.replace(/^-\s+/, '').trim();
      if (!rule) continue;

      if (currentSection === "Don't") {
        rules.push({ source, section: currentSection, rule, type: 'should-not' });
      } else {
        rules.push({ source, section: currentSection, rule, type: 'should' });
      }
    }
  }

  return rules;
}

// ── Generate promptfoo config ─────────────────────────────────────────

function generatePromptfooConfig(
  projectRoot: string,
  configPath: string,
): string {
  const agentctxDir = dirname(configPath);
  const conventionsDir = join(agentctxDir, 'context', 'conventions');

  // Collect all convention files
  const allRules: ConventionRule[] = [];

  if (existsSync(conventionsDir)) {
    const skillDirs = readdirSync(conventionsDir, { withFileTypes: true });
    for (const skillDir of skillDirs) {
      if (!skillDir.isDirectory()) continue;
      const skillPath = join(conventionsDir, skillDir.name);
      const files = readdirSync(skillPath, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith('.md')) continue;
        allRules.push(...extractRules(join(skillPath, file.name)));
      }
    }
  }

  // Build test cases from rules
  const tests: Record<string, unknown>[] = [];

  // Group Don't rules as negative assertions
  const dontRules = allRules.filter(r => r.type === 'should-not');
  if (dontRules.length > 0) {
    tests.push({
      vars: {
        task: 'Build a modern dashboard page with a sidebar, data table, and charts. Use the project conventions.',
      },
      assert: dontRules.slice(0, 15).map(r => ({
        type: 'llm-rubric',
        value: `The code should NOT: ${r.rule}`,
      })),
    });
  }

  // Group Quick Rules as positive assertions
  const shouldRules = allRules.filter(r => r.type === 'should');
  if (shouldRules.length > 0) {
    tests.push({
      vars: {
        task: 'Create a feature that fetches data from an API and displays it in a list with loading and error states.',
      },
      assert: shouldRules.slice(0, 15).map(r => ({
        type: 'llm-rubric',
        value: `The code should follow: ${r.rule}`,
      })),
    });
  }

  // Read CLAUDE.md for system prompt
  const claudeMdPath = join(projectRoot, 'CLAUDE.md');
  const systemPrompt = existsSync(claudeMdPath)
    ? `file://${claudeMdPath}`
    : 'You are a senior developer following project conventions.';

  const config = {
    description: `agentctx convention tests for ${basename(projectRoot)}`,
    prompts: [
      `{{task}}`,
    ],
    providers: [
      {
        id: 'anthropic:messages:claude-haiku-4-5-20251001',
        config: {
          systemPrompt,
          max_tokens: 4096,
        },
      },
    ],
    tests,
    outputPath: join('.agentctx', 'test-results.json'),
  };

  return toYaml(config, { lineWidth: 120 });
}

// ── Main command ──────────────────────────────────────────────────────

export async function testCommand(options: TestOptions): Promise<void> {
  const projectRoot = process.cwd();
  const configPath = findConfigPath(projectRoot);

  if (!configPath) {
    logger.error('No .agentctx/ found. Run `agentctx init` first.');
    process.exit(1);
  }

  const configDir = join(projectRoot, '.agentctx');
  const pfConfigPath = join(configDir, 'promptfooconfig.yaml');

  // Generate config
  logger.info('Generating test config from conventions...');

  const pfConfig = generatePromptfooConfig(projectRoot, configPath);
  await mkdir(configDir, { recursive: true });
  await writeFile(pfConfigPath, pfConfig, 'utf-8');

  if (options.generate) {
    logger.success(`Generated: ${pfConfigPath}`);
    logger.dim('Run `agentctx test` to execute, or `promptfoo eval -c .agentctx/promptfooconfig.yaml` directly.');
    return;
  }

  // Check promptfoo is installed
  try {
    await execFileAsync('promptfoo', ['--version'], { timeout: 5000 });
  } catch {
    logger.error('promptfoo is required to run tests.');
    logger.dim('');
    logger.dim('  Install it globally:');
    logger.dim('    npm install -g promptfoo');
    logger.dim('');
    logger.dim('  Then run: agentctx test');
    logger.dim('  Or generate config only: agentctx test --generate');
    process.exit(1);
  }

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    logger.error('API key required. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
    logger.dim('');
    logger.dim('  export ANTHROPIC_API_KEY=sk-...');
    process.exit(1);
  }

  // Run promptfoo
  logger.info('Running convention tests via promptfoo...');
  logger.dim('  This may take 30-60 seconds depending on test count.\n');

  try {
    const args = ['eval', '-c', pfConfigPath];
    if (options.ci) {
      args.push('--no-cache');
    }

    const { stdout, stderr } = await execFileAsync('promptfoo', args, {
      cwd: projectRoot,
      timeout: 300000, // 5 min max
      env: { ...process.env },
      maxBuffer: 10 * 1024 * 1024,
    });

    console.log(stdout);
    if (stderr) console.error(stderr);

    // Check results
    const resultsPath = join(configDir, 'test-results.json');
    if (existsSync(resultsPath)) {
      try {
        const results = JSON.parse(readFileSync(resultsPath, 'utf-8'));
        const passed = results.results?.filter((r: any) => r.success)?.length ?? 0;
        const total = results.results?.length ?? 0;
        const failed = total - passed;

        console.log('');
        if (failed === 0) {
          logger.success(`All ${total} convention tests passed`);
        } else {
          logger.warn(`${passed}/${total} passed, ${failed} failed`);
          if (options.ci) {
            process.exit(1);
          }
        }
      } catch { /* couldn't parse results */ }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('timed out')) {
      logger.error('Tests timed out after 5 minutes');
    } else {
      logger.error(`Test execution failed: ${msg}`);
    }
    if (options.ci) process.exit(1);
  }
}
