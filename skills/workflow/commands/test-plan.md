Generate a comprehensive test plan from a feature specification.

## Steps

1. Read the spec file: $ARGUMENTS
   - If no argument, check `.agentctx/specs/INDEX.md` for in-progress specs
2. Read the acceptance criteria from the spec
3. For each acceptance criterion, generate test cases:
   - **Happy path**: the normal expected behavior
   - **Edge cases**: boundary conditions, empty inputs, max values
   - **Error cases**: invalid inputs, network failures, unauthorized access
4. Organize tests by type:
   - **Unit tests**: individual functions and components
   - **Integration tests**: API endpoints, database operations
   - **E2E tests**: full user flows (if applicable)
5. For each test case, document:
   - Test name (descriptive, starts with "should")
   - Setup/preconditions
   - Action
   - Expected result
6. Write the test plan to `.agentctx/specs/_templates/` or alongside the spec
7. Print a summary: total test cases by type

## Important
- Be specific — "should return 401 for unauthenticated requests" not "should handle auth"
- Include test data requirements
- Note any mocking/stubbing needs
