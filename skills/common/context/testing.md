---
relevant-when: writing tests, setting up test infrastructure, or deciding what to test
---

# Testing — Common Rules

## Quick Rules
- Test behavior, not implementation — tests should survive refactoring
- One assertion per test when possible — clear failure messages
- Name tests as sentences: "should return 404 when user not found"
- Use real dependencies when fast enough, mock only slow/external services
- Write the test first when fixing a bug — prove it fails, then fix
- Keep tests independent — no shared mutable state between tests

## Patterns

### Test Pyramid
- **Unit tests** (many): pure functions, utilities, business logic
- **Integration tests** (some): API handlers with real DB, component + hooks
- **E2E tests** (few): critical user flows only — login, checkout, core happy path

### Test Organization
- Co-locate tests with source: `utils.ts` → `utils.test.ts`
- Group related tests with `describe` blocks
- Use setup/teardown for shared fixtures, not shared state
- Name test files consistently: `.test.ts`, `.spec.ts`, or `__tests__/`

### What to Test
- Happy path: expected input → expected output
- Edge cases: empty input, null, boundary values, max length
- Error cases: invalid input → appropriate error
- Integration points: API contracts, database queries, external services

## Don't
- Don't test framework internals or third-party library behavior
- Don't write tests that depend on execution order
- Don't use `sleep()` or timing-based assertions — use waitFor/polling
- Don't mock what you don't own — wrap it and test the wrapper
- Don't skip flaky tests — fix the root cause
