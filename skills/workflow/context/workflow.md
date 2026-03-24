# Development Workflow

## Spec-Driven Development

All feature work follows a spec-first approach. Never implement without a spec.

**Rule: When a user asks to implement a feature, suggest running `/spec` first to create a specification before coding.**

### Full Workflow

```
/spec → /approve → /implement → /review → done
                ↘ /breakdown → /approve (each) → /build-with-team → /review → done
```

1. **Create spec**: Use `/spec` to create a feature specification
2. **Approve**: Use `/approve` to review and gate the spec for implementation
3. **Implement** (single-team): Use `/implement` to build from an approved spec
4. **Breakdown** (multi-team): Use `/breakdown` to split into team-specific child specs
5. **Build with team**: Use `/build-with-team` for coordinated multi-agent implementation
6. **Review**: Use `/review` to validate against spec criteria
7. **Update context**: Use `/refresh-context` to update module documentation

### Spec Lifecycle

All specs live in `specs/` directory with status-based naming:
- `specs/draft-NNNN-name.md` — created, not yet approved
- `specs/approved-NNNN-name.md` — reviewed and ready to implement
- `specs/in-progress-NNNN-name.md` — currently being worked on
- `specs/completed-NNNN-name.md` — implementation finished

`specs/INDEX.md` is the master tracker of all specs and their status.

### Team-Specific Specs

For features that span multiple teams, use `/breakdown` to create child specs:
- `specs/_templates/backend-spec.md` — API endpoints, services, database
- `specs/_templates/frontend-spec.md` — pages, components, state
- `specs/_templates/mobile-spec.md` — screens, native, offline
- `specs/_templates/qa-spec.md` — test matrix, edge cases, performance
- `specs/_templates/devops-spec.md` — infrastructure, CI/CD, monitoring

Child specs link to their parent via `parent_spec: NNNN` in frontmatter.

### Approval Gate

Approval is the gate between planning and building:
- Draft specs can change freely
- Approved specs are contracts — the team agrees on what will be built
- Implementation (`/implement`) refuses to start from a draft spec
- Use `/approve` to review and approve a spec

### Checkpoint / Rollback System

Checkpoints are named git commits with tags for easy restoration:
- **Create checkpoint**: `/checkpoint {name}` — stages all changes, commits, tags as `cp-{name}`
- **Rollback**: `/rollback {checkpoint}` — restores to a previous checkpoint
- **Auto-checkpoints**: `/implement` automatically creates `cp-{NNNN}-done` after completion
- **Safety**: Rollback always creates a safety checkpoint first (`cp-pre-rollback-{timestamp}`)

Use checkpoints liberally — they're cheap (just a git tag) and provide safety nets.

### Agent Team Coordination

For multi-team features, `/build-with-team` coordinates parallel agents:

1. **Contracts first**: Define interfaces between teams before any coding
2. **Parallel agents**: All teams work simultaneously, guided by contracts
3. **QA in parallel**: Tests are written from contracts, not after implementation
4. **Integration**: Contract validation, domain checks, end-to-end verification

Key principles:
- Never spawn agents without contracts
- Never spawn agents sequentially
- QA is a first-class participant, not an afterthought
- Agents only modify files within their ownership boundaries

### Rules
- Never implement from a draft spec — it must be approved first
- Always create a feature branch: `feat/{NNNN}-{name}`
- After implementing, update the relevant module file in `.agentctx/context/modules/`
- Log important decisions in `.agentctx/context/decisions.md`
- Create checkpoints after significant work for rollback safety
- When a user asks to implement a feature, suggest running `/spec` first
