Scaffold a new module/feature area following project conventions.

## Steps

1. Read the module name from: $ARGUMENTS
   - If no argument, ask the user what module to create
2. Read `.agentctx/context/architecture.md` to understand the project structure
3. Read existing module files in `.agentctx/context/modules/` to see the pattern
4. Determine the correct location based on architecture conventions:
   - Check existing source directories for the pattern
   - E.g., `src/features/{name}/`, `src/modules/{name}/`, `app/{name}/`
5. Create the module directory with standard files based on the project:
   - For TypeScript/React: `index.ts`, `types.ts`, component files
   - For Python: `__init__.py`, `models.py`, `routes.py`
   - For Go: `{name}.go`, `{name}_test.go`
   - Adapt to what already exists in the project
6. Create the module documentation at `.agentctx/context/modules/{name}.md`:
   - Key files (the ones just created)
   - Exports (empty, to be filled as module grows)
   - Dependencies (none yet)
7. Update `.agentctx/context/status.md` — add as in-progress
8. Print summary of created files

## Important
- Follow the EXACT conventions from architecture.md and existing code
- Don't create boilerplate the project doesn't use
- Match naming conventions (kebab-case files? PascalCase components?)
