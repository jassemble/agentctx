Synchronize the project's AI context with the codebase. Incrementally enriches only stale or new modules — safe to run frequently without burning token budget.

## Steps

1. **Detect project state**: check if `.agentctx/config.yaml` exists
   - If NOT: run `agentctx init` first to scaffold the project, then continue
   - If yes: continue

2. **Run AST scan**: execute `agentctx scan` to detect stack and generate/update module files via static analysis
   - Scan is incremental — unchanged modules are skipped automatically
   - Modules mirror the source directory structure:
     - `app/(auth)/login/` → `.agentctx/context/modules/app/auth/login.md`
     - `components/theme/` → `.agentctx/context/modules/components/theme.md`

3. **Check enrichment status**: run `agentctx sync-status --json` and parse the output
   - This returns JSON with `total`, `fresh`, `stale`, `unenriched`, and `needsEnrichment` (array of module paths)
   - If `needsEnrichment` is empty → print "All modules are fresh, no enrichment needed" and skip to step 6
   - If `needsEnrichment` has more than 10 items → show the list and ask the user: "N modules need enrichment. Proceed? (Y/n)"
   - If `needsEnrichment` has more than 30 items → warn: "Only the first 30 modules will be processed. Run /agentctx-sync again for remaining." and trim the list to 30

4. **Enrich modules in batches of 5**:
   Process modules from the `needsEnrichment` list in batches of 5:

   For each batch:
   a. Read each module file — note the `source-files` listed in the YAML frontmatter
   b. Read each source file listed (only the files for this batch's modules)
   c. For every function in the `## Functions` section, append a brief behavior description after the signature:
      - What it does (1 sentence)
      - Key operations: database calls, API requests, validation, side effects
      - Error handling approach
   d. For every component in the `## Components` section, append:
      - What it renders and key user interactions
      - Important state management or side effects
   e. If there are cross-cutting concerns (env vars, auth patterns, error boundaries), add a `## Behavior Notes` section at the end
   f. **Update the YAML frontmatter** — add or update these two fields after the `source-hash` line:
      ```yaml
      enriched-at: <current ISO 8601 timestamp>
      enriched-hash: <copy the source-hash value from the same frontmatter>
      ```
      Do NOT modify the `source-hash` value itself.
   g. Write all enriched module files back to disk
   h. Print "Enriched batch N/M: <module names>"

   Continue with the next batch until all modules from the list are processed.

5. **Generate high-level context files** (only if any modules were enriched in step 4):
   After reading source files during enrichment, write or update these in `.agentctx/context/`:
   a. `architecture.md` — Project structure, key directories, data flow between modules
   b. `patterns.md` — Key patterns: state management, error handling, auth, data fetching
   c. `style.md` — Code style conventions: naming, file organization, imports
   - Keep each file focused and concise (200-500 words)
   - Be specific to THIS project — reference actual file paths and patterns observed
   - If these files already exist, update them with any new patterns discovered

6. **Regenerate outputs**: run `agentctx generate` to rebuild CLAUDE.md and other output files

7. **Update status** (if `.agentctx/context/status.md` exists):
   - Check `git log --oneline -5` for recent work
   - Update in-progress and recently completed items

8. Print a summary of what was created or updated

## Enrichment format

For functions, change from:
```
- `authenticate(email, password): Promise<{ok: true, user: User} | {ok: false, error: string}>`
```
To:
```
- `authenticate(email, password): Promise<{ok: true, user: User} | {ok: false, error: string}>` — hashes password with bcrypt, queries users table by email, returns User on match or error string on failure
```

For components, change from:
```
- `<LoginForm>` — hooks: useActionState
```
To:
```
- `<LoginForm>` — hooks: useActionState — renders email/password form, calls loginAction server action on submit, displays error state on validation failure
```

## Frontmatter example

Before enrichment:
```yaml
---
generated-by: agentctx-scan
generated-at: 2026-04-06T10:00:00.000Z
source-files:
  - app/(auth)/login/page.tsx
  - app/(auth)/login/actions.ts
source-hash: a1b2c3d4
---
```

After enrichment:
```yaml
---
generated-by: agentctx-scan
generated-at: 2026-04-06T10:00:00.000Z
source-files:
  - app/(auth)/login/page.tsx
  - app/(auth)/login/actions.ts
source-hash: a1b2c3d4
enriched-at: 2026-04-06T10:05:00.000Z
enriched-hash: a1b2c3d4
---
```

## Important
- Module files mirror the source directory structure — enrich files where they are
- Keep behavior descriptions to 1-2 sentences max per function/component
- Only enrich exported/public functions — skip internal helpers unless they contain critical logic
- Don't duplicate source code — describe intent and key operations
- The enriched-at and enriched-hash fields are REQUIRED — they prevent re-processing on subsequent runs
- Batching keeps context window manageable — do not skip batching even if the list is small
