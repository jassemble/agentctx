Run tests relevant to the current changes.

## Steps

1. Detect the test framework:
   - Check for `vitest.config.ts` or vitest in package.json → `npx vitest run`
   - Check for `jest.config.*` or jest in package.json → `npx jest`
   - Check for `pytest.ini` or `pyproject.toml` with pytest → `pytest`
   - Check for `go.mod` → `go test ./...`
   - Check for `Cargo.toml` → `cargo test`
   - If unclear, check `package.json` scripts for a `test` script → `npm test`

2. Determine scope:
   - If $ARGUMENTS provided, run tests matching that pattern/path
   - If on a feature branch, identify changed files with `git diff main --name-only` and run tests related to those files
   - If no arguments and on main, run all tests

3. Run the tests and report results

4. If tests fail:
   - Show which tests failed with clear error messages
   - Suggest fixes based on the error output
   - Do NOT auto-fix without asking the user
