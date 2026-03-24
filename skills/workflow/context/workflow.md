# Development Workflow

## Spec-Driven Development

All feature work follows a spec-first approach. Never implement without a spec.

### Workflow Steps
1. **Create spec**: Use `/spec` to create a feature specification
2. **Implement**: Use `/implement` to build from an approved spec
3. **Review**: Use `/review` to validate against spec criteria
4. **Update context**: Use `/refresh-context` to update module documentation

### Spec Location
All specs live in `specs/` directory:
- `specs/INDEX.md` — master tracker of all specs and their status
- `specs/draft-NNNN-name.md` — specs not yet approved
- `specs/approved-NNNN-name.md` — ready to implement
- `specs/in-progress-NNNN-name.md` — currently being worked on
- `specs/completed-NNNN-name.md` — done

### Rules
- Never implement from a draft spec — it must be approved first
- Always create a feature branch: `feat/{NNNN}-{name}`
- After implementing, update the relevant module file in `.agentctx/context/modules/`
- Log important decisions in `.agentctx/context/decisions.md`
