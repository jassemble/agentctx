Synchronize the project's AI context with the codebase. First run bootstraps everything; subsequent runs update stale modules and enrich with behavior summaries.

## Steps

1. **Detect project state**: check if `.agentctx/config.yaml` exists
   - If NOT: run `agentctx init` first to scaffold the project, then continue
   - If yes: continue

2. **Run AST scan**: execute `agentctx scan` to detect stack and generate module files via static analysis (types, function signatures, components, dependencies)
   - Modules are written mirroring the source directory structure:
     - `app/(auth)/login/` → `.agentctx/context/modules/app/auth/login.md`
     - `components/theme/` → `.agentctx/context/modules/components/theme.md`
     - `lib/auth.ts` → `.agentctx/context/modules/lib/auth.md`
     - Root files (app/layout.tsx, app/page.tsx) → `.agentctx/context/modules/_root.md`

3. **Enrich modules with behavior summaries**:
   For each module file in `.agentctx/context/modules/` (including nested subdirectories like `modules/app/auth/login.md`, `modules/lib/auth.md`):
   a. Read the module file — note the `source-files` listed in the YAML frontmatter
   b. Read each source file listed
   c. For every function in the `## Functions` section, append a brief behavior description after the signature:
      - What it does (1 sentence)
      - Key operations: database calls, API requests, validation, side effects
      - Error handling approach
   d. For every component in the `## Components` section, append:
      - What it renders and key user interactions
      - Important state management or side effects
   e. If there are cross-cutting concerns (env vars, auth patterns, error boundaries), add a `## Behavior Notes` section at the end
   f. Write the enriched module file back to disk

4. **Generate high-level context files** in `.agentctx/context/`:
   After reading all source files during enrichment, write or update these files:
   a. `architecture.md` — Project structure, key directories, how code is organized, data flow between modules
   b. `patterns.md` — Key patterns used: state management, error handling, authentication, data fetching
   c. `style.md` — Code style conventions: naming, file organization, import patterns, component patterns
   - Keep each file focused and concise (200-500 words)
   - Be specific to THIS project — reference actual file paths and patterns observed
   - If these files already exist, update them with any new patterns discovered

5. **Regenerate outputs**: run `agentctx generate` to rebuild CLAUDE.md and other output files with the enriched context

6. **Update status** (if `.agentctx/context/status.md` exists):
   - Check `git log --oneline -5` for recent work
   - Update in-progress and recently completed items

7. Print a summary of what was created or updated

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

## Important
- Module files mirror the source directory structure — enrich files where they are (e.g., `modules/app/auth/login.md`, not a flat `modules/login.md`)
- Keep behavior descriptions to 1-2 sentences max per function/component
- Only enrich exported/public functions — skip internal helpers unless they contain critical logic
- Don't duplicate source code — describe intent and key operations
- On first run this may take 30-60 seconds depending on codebase size
