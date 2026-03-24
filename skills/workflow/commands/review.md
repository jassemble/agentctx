Review the current implementation against spec acceptance criteria.

## Steps

1. Determine which spec to review:
   - If argument provided, use that spec: $ARGUMENTS
   - Otherwise, find in-progress specs from `specs/INDEX.md`
2. Read the spec file — focus on the acceptance criteria
3. Read the git diff for the current branch: `git diff main...HEAD`
4. For each acceptance criterion:
   - Check if the implementation satisfies it
   - Mark as PASS or FAIL with a brief explanation
5. Check code quality:
   - Read CLAUDE.md conventions — are they followed?
   - Any obvious issues (error handling, edge cases, security)?
6. Print a review summary:
   - Acceptance criteria: X/Y passed
   - Issues found (if any)
   - Suggestions for improvement
