import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ContextModule } from '../../core/context.js';
import type { LintResult } from '../index.js';
import { spawnWithStdin } from '../../utils/exec.js';

const execFileAsync = promisify(execFile);

interface AiFinding {
  check: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  locations?: string[];
  suggestion?: string;
}

interface AiResponse {
  findings: AiFinding[];
  score: number;
}

const SYSTEM_PROMPT = `You are a context quality reviewer for AI agent instruction files. You analyze markdown files that instruct AI coding assistants (like Claude Code, Cursor, GitHub Copilot) on how to behave in a project.

Analyze the provided context modules and check for:

1. CONTRADICTIONS — Instructions that conflict with each other across different modules. For example, one module says "use classes" while another says "prefer functions".

2. COMPLETENESS — Important sections that are missing. Common ones: error handling conventions, testing strategy, security practices, naming conventions, git workflow.

3. CLARITY — Instructions that are too vague to be actionable. For example, "use appropriate testing" or "follow best practices" without specifics.

4. SPECIFICITY — Instructions that are too generic and could apply to any project. Good context is project-specific.

Respond with ONLY valid JSON in this exact format:
{
  "findings": [
    {
      "check": "contradictions" | "completeness" | "clarity" | "specificity",
      "severity": "warning" | "info",
      "message": "Clear description of the issue",
      "locations": ["module-name.md:approximate-line"],
      "suggestion": "How to fix it"
    }
  ],
  "score": 7.5
}

Rules:
- score is 1-10 (10 = perfect)
- Only report real issues, not nitpicks
- Keep findings to max 8 most important ones
- If everything looks good, return empty findings array with high score
- severity "warning" for real problems, "info" for suggestions`;

function buildContent(modules: ContextModule[]): string {
  return modules.map(m =>
    `--- MODULE: ${m.filename} ---\n${m.content}`
  ).join('\n\n');
}

function parseResponse(stdout: string): AiResponse | null {
  // Try to extract JSON from response (claude may include text around it)
  const jsonMatch = stdout.match(/\{[\s\S]*"findings"[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed.findings) && typeof parsed.score === 'number') {
      return parsed as AiResponse;
    }
  } catch { /* invalid JSON */ }

  return null;
}

export async function checkAi(
  modules: ContextModule[],
): Promise<LintResult[]> {
  // Check if claude CLI is available
  try {
    await execFileAsync('claude', ['--version'], { timeout: 5000 });
  } catch {
    return [{
      code: 'ACX-AI',
      name: 'ai-lint',
      severity: 'info',
      message: 'claude CLI not found — install Claude Code to enable AI-powered checks',
      passed: true,
    }];
  }

  if (modules.length === 0) {
    return [{
      code: 'ACX-AI',
      name: 'ai-lint',
      severity: 'info',
      message: 'No context modules to analyze',
      passed: true,
    }];
  }

  const content = buildContent(modules);

  try {
    const stdout = await spawnWithStdin('claude', [
      '--print',
      '--model', 'haiku',
      '--system-prompt', SYSTEM_PROMPT,
    ], content, 60000);

    const response = parseResponse(stdout);

    if (!response) {
      return [{
        code: 'ACX-AI',
        name: 'ai-lint',
        severity: 'info',
        message: 'AI analysis returned unparseable response',
        passed: true,
      }];
    }

    const results: LintResult[] = [];

    for (const finding of response.findings) {
      const locationStr = finding.locations?.length
        ? ` (${finding.locations.join(', ')})`
        : '';
      const suggestionStr = finding.suggestion
        ? ` — ${finding.suggestion}`
        : '';

      results.push({
        code: `ACX-AI`,
        name: `ai-${finding.check}`,
        severity: finding.severity,
        message: `${finding.message}${locationStr}${suggestionStr}`,
        passed: false,
      });
    }

    // Add overall score
    results.push({
      code: 'ACX-AI',
      name: 'ai-score',
      severity: 'info',
      message: `Context quality score: ${response.score}/10`,
      passed: response.score >= 7,
    });

    return results;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('timed out')) {
      return [{
        code: 'ACX-AI',
        name: 'ai-lint',
        severity: 'info',
        message: 'AI analysis timed out (30s limit)',
        passed: true,
      }];
    }
    return [{
      code: 'ACX-AI',
      name: 'ai-lint',
      severity: 'info',
      message: `AI analysis failed: ${msg}`,
      passed: true,
    }];
  }
}
