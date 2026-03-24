Create a team-specific technical spec directly, without a parent feature spec.

Use this when you need a focused spec for a single team (backend, frontend, mobile, QA, or devops) without the overhead of a full feature spec and breakdown.

## Steps

1. Parse the argument: $ARGUMENTS
   - Expected format: `team: description` (e.g., `backend: add user authentication endpoint`)
   - If no team prefix, ask the user which team: backend, frontend, mobile, qa, devops

2. Determine the next spec number by reading `specs/INDEX.md`

3. Select the appropriate template from `specs/_templates/`:
   - backend → `backend-spec.md`
   - frontend → `frontend-spec.md`
   - mobile → `mobile-spec.md`
   - qa → `qa-spec.md`
   - devops → `devops-spec.md`

4. Create the spec file at `specs/draft-{NNNN}-{kebab-name}.md` using the team template

5. Fill in all sections with team-specific details:
   - For backend: API endpoints, request/response contracts, database changes
   - For frontend: pages/routes, components, state management
   - For mobile: screens, navigation, platform-specific behavior
   - For QA: test matrix, test types, coverage requirements
   - For devops: infrastructure, CI/CD, monitoring

6. Update `specs/INDEX.md` with the new spec entry, noting the team

7. Print the spec path and summary

## When to use /rfp vs /spec
- Use `/spec` when building a full feature that may span multiple teams → then `/breakdown`
- Use `/rfp` when you know exactly which team owns the work and don't need a parent spec
- `/rfp` is faster for focused, single-team tasks
