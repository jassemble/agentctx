Show a comprehensive project status overview.

## Steps

1. **Git Status**
   - Current branch
   - Uncommitted changes count
   - Last commit message and date
   - List `feat/*` branches with their linked spec numbers

2. **Specs Status**
   - Read `specs/INDEX.md`
   - Count by status: draft, approved, in-progress, completed
   - List in-progress specs with their branch names

3. **Context Health**
   - Count module files in `.agentctx/context/modules/`
   - Check if architecture.md is customized (not scaffold)
   - Check decisions.md for entries
   - Last refresh date (most recent module file modification)

4. **Checkpoints**
   - List recent checkpoints: `git tag -l "cp-*" --sort=-creatordate | head -5`

5. Print formatted summary:
   ```
   Project: my-app (nextjs + tailwind)
   Branch:  feat/0001-auth (3 uncommitted files)

   Specs:   1 draft, 2 approved, 1 in-progress, 5 completed
   Modules: 4 documented in .agentctx/context/modules/
   Context: Last refreshed 2 days ago

   Recent checkpoints:
     cp-0001-auth-done (2 hours ago)
     cp-pre-rollback-1234 (yesterday)
   ```
