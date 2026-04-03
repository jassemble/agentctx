<p align="center">
  <h1 align="center">agentctx</h1>
  <p align="center"><strong>AI Development Framework — context, workflow, agents</strong></p>
  <p align="center">One CLI tool that replaces your entire SDLC setup for AI-assisted development.</p>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#how-it-works">How It Works</a> &middot;
  <a href="#commands">Commands</a> &middot;
  <a href="#skills">Skills</a> &middot;
  <a href="#agents">Agents</a> &middot;
  <a href="#workflow">Workflow</a> &middot;
  <a href="#dashboard">Dashboard</a>
</p>

---

Every AI coding tool needs its own context file. Developers manually write and maintain `CLAUDE.md`, `.cursorrules`, `copilot-instructions.md` — duplicating conventions, letting them drift, and losing project knowledge between sessions.

**agentctx** treats project context as code — modular, composable, version-controlled — and generates output for **10 different AI tools** from a single source of truth. Plus: spec-driven workflow, design commands, 156 AI agent specialists, health monitoring, and a live dashboard.

## Quick Start

```bash
# 1. Install
npm install -g agentctx-cli

# 2. Initialize — interactive setup that detects your stack,
#    picks skills, selects agents, scans your codebase via AST,
#    and generates output files. One command, fully set up.
agentctx init

# 3. In Claude Code, enrich modules with behavior summaries
/agentctx-sync
```

You get:
- Production-grade conventions for your stack
- AST-scanned codebase modules (types, functions, components, directives)
- 38+ slash commands for workflow and design
- Output files for Claude Code, Cursor, Copilot, Gemini, Windsurf, and more
- A spec-driven development workflow with approval gates

### Everyday Commands

```bash
agentctx scan              # Re-scan after code changes (AST modules + tech stack)
agentctx generate          # Rebuild output files (CLAUDE.md, .cursorrules, etc.)
agentctx doctor            # Health check — stale modules? missing context?
agentctx dashboard         # Open live project dashboard
```

### Expand Your Setup

```bash
agentctx add design workflow       # Add skills
agentctx add frontend-developer    # Add AI agent personality
agentctx lint --ai                 # AI-powered context quality check
```

### What gets created

```
your-project/
├── .agentctx/
│   ├── config.yaml                    # Master configuration
│   ├── specs/                         # Feature specs (workflow engine)
│   │   ├── INDEX.md                   # Spec tracker
│   │   └── _templates/               # 8 spec templates
│   └── context/                       # Living context — the source of truth
│       ├── architecture.md            # Project structure (you customize)
│       ├── decisions.md               # Architecture decision log
│       ├── conventions/               # From skills (auto-populated)
│       │   ├── nextjs/                # routing, data-fetching, project-structure
│       │   ├── typescript/            # type-patterns, error-handling, conventions
│       │   ├── tailwind/              # utility-classes, component-patterns
│       │   └── design/                # design-principles, anti-patterns
│       ├── references/                # Lookup guides from skills
│       ├── modules/                   # Your feature docs (auth, payments, etc.)
│       └── agents/                    # AI personality
├── .claude/commands/                  # 38+ slash commands installed
├── CLAUDE.md                          # Generated — Claude Code
├── .cursor/rules/agentctx.mdc        # Generated — Cursor
├── .github/copilot-instructions.md   # Generated — GitHub Copilot
└── ...                                # + 7 more output formats
```

## How It Works

### The Core Idea

Instead of writing one monolithic `CLAUDE.md` (that every tool ignores half of), agentctx creates a **thin router** (~300 tokens) that points AI tools to read modular context files on demand:

```markdown
## Context Routing

| Working on          | Read first              | Also read              |
|---------------------|-------------------------|------------------------|
| React pages/routes  | conventions/nextjs/     | references/nextjs/     |
| Styling/CSS         | conventions/design/     | references/design/     |
| TypeScript logic    | conventions/typescript/ | relevant modules/*.md  |
| New feature         | modules/*.md            | architecture.md        |
```

AI reads **only what's relevant** to the current task. No 160K token dump.

### Write Once, Output Everywhere

One `.agentctx/` directory generates output for 10 AI tools:

| Target | Output File | Format |
|--------|-------------|--------|
| Claude Code | `CLAUDE.md` | Full context with routing |
| Cursor | `.cursor/rules/agentctx.mdc` | YAML frontmatter + markdown |
| GitHub Copilot | `.github/copilot-instructions.md` | Markdown |
| Windsurf | `.windsurfrules` | Comment-style rules |
| Aider | `CONVENTIONS.md` | Markdown |
| Codex | `AGENTS.md` | Markdown |
| Gemini | `GEMINI.md` | Markdown |
| OpenCode | `.opencode/agents/*.md` | YAML frontmatter |
| Qwen | `.qwen/agents/*.md` | YAML frontmatter |
| OpenClaw | `SOUL.md` + `AGENTS.md` + `IDENTITY.md` | Three-file format |

```bash
# Generate all outputs
agentctx generate

# Generate specific target
agentctx generate --target claude

# Preview changes without writing
agentctx generate --diff
```

## Commands

### Setup & Configuration

| Command | Description |
|---------|-------------|
| `agentctx init [skills...]` | Initialize `.agentctx/` with optional skills |
| `agentctx add <items...>` | Add skills or agents to existing project |
| `agentctx update [--dry-run]` | Update installed skills to latest versions |
| `agentctx generate` | Regenerate all output files from context |

### Quality & Health

| Command | Description |
|---------|-------------|
| `agentctx lint [--ai]` | Validate context quality (schema, refs, tokens, drift) |
| `agentctx test [--ci]` | Test convention compliance via promptfoo |
| `agentctx doctor` | Health check — stack detection, recommendations, score |
| `agentctx scan` | Analyze codebase — AST module generation + tech stack detection |

### Agents & Dashboard

| Command | Description |
|---------|-------------|
| `agentctx agents list` | Browse 156 bundled AI specialists |
| `agentctx agents info <name>` | View agent details |
| `agentctx agents add <name>` | Add agent to project |
| `agentctx dashboard` | Launch live web dashboard |

### Command Flags

```bash
# Init
agentctx init nextjs typescript --agent backend-architect
agentctx init --force              # Overwrite existing
agentctx init --app apps/web       # Monorepo app

# Scan
agentctx scan                      # AST modules + tech stack (default)
agentctx scan --ai                 # Also run AI analysis (architecture, patterns, style)
agentctx scan --no-modules         # Skip AST module generation
agentctx scan --deep               # Generate code map (routes, hooks, services)
agentctx scan --suggest-skills     # Just show skill recommendations

# Generate
agentctx generate --target claude  # Specific target only
agentctx generate --diff           # Show diff without writing
agentctx generate --dry-run        # Print to stdout
agentctx generate --verbose        # Show assembly details

# Lint
agentctx lint --strict             # Exit non-zero on warnings
agentctx lint --ai                 # AI-powered quality analysis
agentctx lint --format github      # GitHub Actions annotations

# Test
agentctx test --generate           # Only generate config, don't run
agentctx test --ci                 # CI mode — exit 1 on failures

# Dashboard
agentctx dashboard --port 3000     # Custom port
agentctx dashboard --no-open       # Don't open browser
```

## Skills

Skills are composable knowledge packs — conventions, commands, references, and templates for a specific technology.

### Built-in Skills

| Skill | What it provides |
|-------|-----------------|
| **nextjs** | App Router routing, data fetching, Server Components, project structure |
| **typescript** | Type patterns, error handling, strict mode, project conventions |
| **tailwind** | Utility-first patterns, component strategies, responsive design |
| **design** | Design principles, anti-patterns, 19 quality commands, 8 reference guides |
| **python-fastapi** | FastAPI endpoints, models, async patterns, project structure |
| **workflow** | Spec-driven development, 18 workflow commands, 8 spec templates |

### Skill Structure

Each skill contains:

```
skills/nextjs/
├── skill.yaml           # Metadata, provides, conflicts
├── context/             # Convention files (loaded into CLAUDE.md)
│   ├── routing.md       # Quick Rules + Patterns + Don't
│   ├── data-fetching.md
│   └── project-structure.md
├── reference/           # Lookup guides
│   └── app-router-patterns.md
├── commands/            # Slash commands (installed to .claude/commands/)
└── scaffolds/           # Template files
```

Convention files use a three-layer structure:

- **Quick Rules** — always read (3-5 critical rules)
- **Patterns** — read when implementing (detailed guidance + code examples)
- **Don't** — read before submitting (anti-patterns and gotchas)

### Composing Skills

```bash
# Add skills to existing project
agentctx add nextjs tailwind design

# Skills detect conflicts automatically
# e.g., nextjs conflicts with remix, sveltekit, nuxt
```

Skills are namespaced to prevent collisions: `conventions/nextjs/routing.md`, `conventions/design/design-principles.md`.

## Agents

agentctx bundles **156 AI agent specialists** from [Agency Agents](https://github.com/msitarzewski/agency-agents). Each agent is a complete personality with goals, constraints, and deliverable templates.

### Agent Categories

| Category | Examples | Count |
|----------|----------|-------|
| Engineering | Backend Architect, Frontend Developer, DevOps Automator, Security Engineer, SRE, Code Reviewer | 10+ |
| Design | UI Designer, UX Architect, UX Researcher, Brand Guardian, Visual Storyteller | 8 |
| Testing | Accessibility Auditor, API Tester, Performance Benchmarker, Test Analyzer | 8 |
| Product | Product Manager, Feedback Synthesizer, Trend Researcher | 5 |
| Academic | Anthropologist, Historian, Psychologist, Narratologist | 5 |
| Game/XR | Unity Architect, Unreal Engineer, VisionOS, Godot Developer | 20+ |
| Marketing | SEO, Social Media, Growth Hacker, Content Creator | 40+ |
| Sales | Sales Coach, Deal Strategist, Pipeline Analyst | 10+ |
| Support | Analytics Reporter, Finance Tracker, Legal Compliance | 8 |
| Specialized | MCP Builder, Developer Advocate, Workflow Architect | 15+ |

### Using Agents

```bash
# Browse all agents
agentctx agents list

# Get details
agentctx agents info backend-architect

# Add to project
agentctx agents add frontend-developer

# Add during init
agentctx init nextjs --agent frontend-developer
```

When added, the agent personality is written to `.agentctx/context/agents/agent.md` and included in all generated output files.

## Workflow

The workflow skill adds a **spec-driven development engine** — features start as specs, pass through approval gates, and are implemented with full context awareness.

### The Spec Lifecycle

```
draft  ──>  approved  ──>  in-progress  ──>  completed
                                              (or cancelled)
```

Status lives in YAML frontmatter. Filenames never change. Every transition is recorded with a date.

### Single-Area Features

```bash
# 1. Create spec
/spec Add user authentication with email/password

# 2. Review and approve
/approve .agentctx/specs/0001-add-user-authentication.md

# 3. Implement (creates branch, loads context, builds, checkpoints)
/implement .agentctx/specs/0001-add-user-authentication.md

# 4. Review against acceptance criteria
/review
```

### Multi-Area Features

```bash
# 1. Create Business Requirements Document
/brd Add real-time notifications across web and mobile

# 2. Approve the BRD
/approve .agentctx/specs/0002-real-time-notifications.md

# 3. Break down into team-specific specs
/breakdown .agentctx/specs/0002-real-time-notifications.md
# Creates: backend, frontend, mobile, QA child specs

# 4. Approve each child spec
/approve .agentctx/specs/0003-real-time-notifications-backend.md

# 5. Build with parallel agents
/build-with-team
```

### Workflow Commands

| Command | Purpose |
|---------|---------|
| `/spec` | Create feature specification |
| `/brd` | Create Business Requirements Document |
| `/rfp` | Create team-specific Request For Proposal |
| `/approve` | Gate spec for implementation |
| `/breakdown` | Split BRD into team-specific child specs |
| `/implement` | Start building from approved spec |
| `/build-with-team` | Coordinate multi-agent parallel work |
| `/review` | Validate against spec criteria |
| `/checkpoint` | Create named git checkpoint |
| `/rollback` | Restore to previous checkpoint |
| `/test-plan` | Create comprehensive test matrix |
| `/qa-review` | QA validation checklist |
| `/deploy-check` | Deployment readiness check |
| `/project-status` | Show project health overview |
| `/agentctx-sync` | Bootstrap or sync context — AST scan + AI enrichment + generate |
| `/new-module` | Document a new module |
| `/orchestrate` | Coordinate complex multi-phase features |

### What `/implement` Actually Does

1. Loads all project context — conventions, architecture, decisions, existing modules
2. Creates feature branch: `git checkout -b feat/0001-add-user-authentication`
3. Updates spec status: `approved` → `in-progress`
4. Implements each acceptance criterion as a task
5. Updates module documentation — creates/updates exports, key files, dependencies
6. Creates checkpoint: `cp-0001-done` (git tag for rollback)
7. Updates spec status: `in-progress` → `completed`

### Design Commands

The design skill adds 19 quality commands:

| Command | Purpose |
|---------|---------|
| `/audit` | Score 5 dimensions: accessibility, performance, theming, responsive, anti-patterns |
| `/critique` | UX critique from user perspective |
| `/polish` | Final pass before shipping |
| `/harden` | Error states, loading states, edge cases |
| `/normalize` | Standardize design tokens and inconsistencies |
| `/distill` | Simplify and reduce complexity |
| `/animate` | Add motion and animations |
| `/extract` | Extract reusable components |
| `/typeset` | Typography refinement |
| `/colorize` | Apply color system |
| `/adapt` | Make designs responsive |
| `/bolder` | Increase visual emphasis |
| `/clarify` | Improve clarity |
| `/delight` | Add micro-interactions |
| `/quieter` | Reduce visual noise |
| `/onboard` | Create onboarding flows |
| `/optimize` | Performance optimization |
| `/overdrive` | Amplify visual impact |
| `/arrange` | Layout organization |

## Dashboard

```bash
agentctx dashboard
```

Live web UI served locally with SSE-powered hot reload:

- **Spec Board** — Kanban view: Draft → Approved → In Progress → Completed
- **Modules** — Interactive SVG dependency graph with hover highlighting
- **Context** — File tree browser with search
- **Health** — Doctor results + sync controls
- **Activity** — Git commit + spec change timeline

## Quality & CI

### Lint

```bash
# Basic checks: schema, broken refs, token budgets, output drift
agentctx lint

# AI-powered analysis: contradictions, completeness, clarity, specificity
agentctx lint --ai

# CI integration
agentctx lint --strict --format github
```

### Test

Convention compliance testing via [promptfoo](https://www.promptfoo.dev/):

```bash
# Generate test config and run
agentctx test

# CI mode
agentctx test --ci
```

Extracts rules from convention files and generates assertions:
- **Quick Rules** → positive assertions (AI should follow)
- **Don't** section → negative assertions (AI should avoid)

### Doctor

```bash
agentctx doctor
```

Checks: stack detection, skill match, ORM context, module count, architecture customization, decisions populated, context freshness. Returns a health score with actionable recommendations.

### Token Budgets

Each output target can set a `max_tokens` budget in `config.yaml`:

```yaml
outputs:
  claude:
    enabled: true
    path: CLAUDE.md
    max_tokens: 160000
```

`agentctx lint` and `agentctx generate` report token usage against budgets.

## Monorepo Support

Child apps inherit from a root `.agentctx/` with configurable merge strategies:

```yaml
# apps/web/.agentctx/config.yaml
inherit:
  from: ../../.agentctx
  strategy: merge      # merge | override | append
  exclude:
    - outputs          # use child's output config
```

Shared conventions stay in the root. Each app adds its own skills and overrides.

## Configuration

### config.yaml

```yaml
version: 1
project:
  name: my-app
  language: typescript
  framework: nextjs

agent: frontend-developer

skills:
  - nextjs
  - typescript
  - tailwind
  - design
  - workflow

context:
  - context/architecture.md
  - context/decisions.md
  - context/conventions/nextjs/routing.md
  - context/conventions/nextjs/data-fetching.md
  - context/conventions/nextjs/project-structure.md
  - context/conventions/typescript/type-patterns.md
  - context/conventions/design/design-principles.md
  - context/modules/auth.md

outputs:
  claude:
    enabled: true
    path: CLAUDE.md
    max_tokens: 160000
  cursorrules:
    enabled: true
    path: .cursor/rules/agentctx.mdc
  copilot:
    enabled: true
    path: .github/copilot-instructions.md

lint:
  token_budgets: true
  broken_refs: true
  freshness:
    enabled: true
    stale_days: 30
```

### Convention File Format

```markdown
---
relevant-when: styling, layout, colors, typography, spacing
---

# Design Principles

## Quick Rules
- Use design tokens (CSS custom properties) for all values
- 4px base spacing scale (4, 8, 12, 16, 24, 32, 48, 64, 96)
- Max 2 font families

## Patterns
### Spacing System
[Detailed implementation guidance with code examples]

## Don't
- Never hardcode colors or spacing values
- Never use arbitrary spacing (13px, 17px)
```

## Why agentctx

| Problem | How agentctx solves it |
|---------|----------------------|
| Duplicate context files across AI tools | Write once in `.agentctx/`, generate for 10 tools |
| CLAUDE.md becomes a 160K token blob | Thin router + modular context read on demand |
| No conventions until month six | `agentctx init nextjs` gives production-grade conventions instantly |
| AI starts coding before plan is agreed | Spec-driven workflow with approval gates |
| Knowledge lost between sessions | Module files, decisions log, status updates persist context |
| "AI slop" in design output | 19 design commands enforce real principles (spacing scale, WCAG, tokens) |
| Finding the right AI specialist | 156 agents on demand — security, database, devops, design, QA |
| Stale context nobody maintains | `agentctx doctor` detects drift, `agentctx lint` catches issues |
| Different setup per monorepo app | Inheritance system with merge/override/append strategies |
| No CI for AI context quality | `agentctx lint --format github` + `agentctx test --ci` |

## License

MIT

---

<p align="center">
  <strong>agentctx</strong> is <code>package.json</code> for AI context — composable skills, automatic multi-tool output, spec-driven workflow, design quality gates, and 156 agent specialists, all from one CLI.
</p>
