Run pre-deployment validation checks.

## Steps

1. Detect the project type and available tools
2. Run checks in order (stop on critical failures):

   **Code Quality**
   - Type checking: `tsc --noEmit` / `mypy` / equivalent
   - Linting: `eslint` / `ruff` / `biome` / equivalent
   - Formatting: check if files are formatted

   **Tests**
   - Run full test suite
   - Report coverage if available

   **Build**
   - Run build command: `npm run build` / `python -m build` / equivalent
   - Verify build output exists

   **Environment**
   - Check `.env.example` matches actual `.env` keys (no missing vars)
   - Check for hardcoded secrets or localhost URLs in code

   **Git Status**
   - Verify on a feature branch (not main)
   - Check for uncommitted changes
   - Verify branch is up to date with remote

3. Print a summary:
   ```
   ✓ Type Check     passed
   ✓ Lint           passed
   ✓ Tests          14/14 passed
   ✓ Build          success
   ⚠ Environment    missing API_KEY in .env
   ✓ Git            clean, on feat/0001-auth
   ```

4. Overall verdict: READY TO MERGE or BLOCKED (with reasons)
