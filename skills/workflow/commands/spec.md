Create a feature specification from the user's description.

## Steps

1. **Read existing context** before writing the spec:
   - Read the Module Index in `CLAUDE.md` to understand what already exists
   - Check `.agentctx/specs/INDEX.md` for related specs (avoid duplicating work)
   - Read `.agentctx/context/architecture.md` to understand where new code should go
   - This ensures the spec references existing modules and follows established patterns

2. Read the feature description provided: $ARGUMENTS
3. Determine the next spec number by reading `.agentctx/specs/INDEX.md` (start at 0001 if INDEX.md doesn't exist or is empty)
4. Create the spec file at `.agentctx/specs/{NNNN}-{kebab-name}.md` using the template at `.agentctx/specs/_templates/feature-spec.md`
   - **No status prefix in filename** — status is tracked in YAML frontmatter only
5. Fill in all sections:
   - **Frontmatter**: Set `id`, `title`, `status: draft`, `created` and `updated` to today's date, `priority: P2`, and initialize `history` array with `[{ status: draft, date: today }]`
   - **Title**: Clear, concise feature name
   - **Description**: What this feature does and why
   - **Requirements**: Specific, testable requirements (numbered)
   - **Acceptance Criteria**: Checklist of conditions that must be true when done
   - **Affected Files**: List files/directories that will be created or modified
   - **Dependencies**: What this feature depends on (other modules, APIs, etc.)
   - **Notes**: Implementation hints, edge cases, gotchas
6. Update `.agentctx/specs/INDEX.md` with the new spec entry
7. Print the spec path and a summary

## Important
- The spec status is `draft` — it needs approval before implementation
- Status is tracked in YAML frontmatter, NOT in the filename
- Be specific in acceptance criteria — each one should be verifiable
- List ALL files that will be touched, not just new ones
- Check `.agentctx/context/modules/` for existing modules this feature interacts with
