Validate the implementation against the test plan and acceptance criteria.

## Steps

1. Read the spec or test plan: $ARGUMENTS
   - If no argument, find in-progress specs from `specs/INDEX.md`
2. Read the actual test files in the codebase
3. For each test case in the plan:
   - Check if a corresponding test exists in the codebase
   - Mark as: COVERED, MISSING, or PARTIAL
4. Run the test suite to verify passing tests
5. For each acceptance criterion from the spec:
   - Check if it has test coverage
   - Check if the implementation satisfies it
   - Mark as: PASS, FAIL, or UNTESTED
6. Generate a QA report:
   - Test coverage: X/Y test cases implemented
   - Acceptance criteria: X/Y satisfied
   - Missing tests (if any)
   - Failed criteria (if any)
   - Recommendations

## Important
- A feature is NOT done until all acceptance criteria pass
- Missing test coverage should be flagged, not ignored
- If tests exist but don't cover edge cases, flag as PARTIAL
