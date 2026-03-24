Implement a feature across multiple apps or areas sequentially.

Use this when a spec affects multiple parts of the codebase (backend + frontend, API + mobile, etc.) and you want to implement them one at a time in the right order.

For parallel implementation with agent teams, use `/build-with-team` instead.

## Steps

1. Read the spec: $ARGUMENTS
   - Must be an approved spec or have approved child specs from `/breakdown`
   - If the spec has child specs, use those as the implementation order
   - If no child specs, determine affected areas from the spec's "Affected Files" section

2. Determine implementation order (dependencies first):
   - Database / schema changes first
   - Backend / API second
   - Frontend / web third
   - Mobile fourth
   - QA / tests throughout
   - DevOps / infrastructure last

3. For each area, implement sequentially:
   a. Announce: "Implementing: {area} ({N}/{total})"
   b. Read the relevant child spec or section
   c. Read `.agentctx/context/modules/` for existing code in this area
   d. Read architecture.md for conventions
   e. Implement the changes
   f. Run relevant tests for this area
   g. Create a checkpoint: `git add -A && git commit -m "checkpoint: {spec-id} {area} done" && git tag cp-{spec-id}-{area}`
   h. Update the module file for this area

4. After all areas are done:
   - Run full test suite
   - Update spec status to completed
   - Update `specs/INDEX.md`
   - Update `.agentctx/context/status.md`
   - Create final checkpoint: `cp-{spec-id}-done`

5. Print summary:
   - Areas implemented (with checkpoint tags)
   - Tests passed/failed
   - Files changed per area

## When to use /orchestrate vs /build-with-team
- `/orchestrate`: You want sequential, careful implementation with checkpoints between each area. Safer, easier to debug.
- `/build-with-team`: You want parallel implementation with multiple agents. Faster, but requires contracts and coordination.
