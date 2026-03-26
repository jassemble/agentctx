Review the current implementation against spec acceptance criteria.

## Steps

1. **Load project conventions** before reviewing:
   - Read `CLAUDE.md` — specifically the conventions and anti-patterns sections
   - Read the relevant module files for the areas being reviewed
   - The review MUST check adherence to project-specific conventions, not just general code quality

2. Determine which spec to review:
   - If argument provided, use that spec: $ARGUMENTS
   - Otherwise, find in-progress specs from `.agentctx/specs/INDEX.md`
3. Read the spec file — focus on the acceptance criteria
4. Read the git diff for the current branch: `git diff main...HEAD`
5. For each acceptance criterion:
   - Check if the implementation satisfies it
   - Mark as PASS or FAIL with a brief explanation
6. Check code quality:
   - Read CLAUDE.md conventions — are they followed?
   - Any obvious issues (error handling, edge cases, security)?
7. Print a review summary:
   - Acceptance criteria: X/Y passed
   - Issues found (if any)
   - Suggestions for improvement
