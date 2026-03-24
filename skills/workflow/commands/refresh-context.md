Update the project's living context files based on recent changes.

## Steps

1. Check recent git changes: `git diff HEAD~5 --stat` and `git log --oneline -5`
2. Read existing module files in `.agentctx/context/modules/`
3. For each changed area of the codebase:
   - If a module file exists for it, update it with new/changed exports, files, dependencies
   - If no module file exists and the changes are substantial, create one
4. Update `.agentctx/context/status.md`:
   - Move completed items to "Recently Completed"
   - Note any new in-progress work
5. If any architectural patterns changed, update `.agentctx/context/architecture.md`
6. Run `agentctx generate` to regenerate CLAUDE.md with the updated context
7. Print a summary of what was updated
