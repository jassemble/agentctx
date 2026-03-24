Implement a feature from an approved spec.

## Steps

1. Read the spec file: $ARGUMENTS
   - If no argument provided, check `specs/INDEX.md` for approved specs and ask which one
   - If the spec status is `draft`, STOP and tell the user it needs approval first
2. Read the project context:
   - Read `CLAUDE.md` for conventions and patterns
   - Read relevant module files in `.agentctx/context/modules/` for existing code
   - Read `.agentctx/context/architecture.md` for structure conventions
3. Create a feature branch: `git checkout -b feat/{NNNN}-{name}`
4. Rename the spec file from `approved-*` to `in-progress-*` and update INDEX.md
5. Convert acceptance criteria into a task list
6. Implement each task:
   - Follow conventions from CLAUDE.md
   - Reuse existing functions from modules/ documentation
   - Put new files in the correct location per architecture.md
7. After implementation:
   - Create or update the module file in `.agentctx/context/modules/{feature}.md`
   - Document: key files, exports, dependencies
   - Update `.agentctx/context/status.md`
   - Log any architectural decisions in `.agentctx/context/decisions.md`
8. Rename spec from `in-progress-*` to `completed-*` and update INDEX.md
9. Print a summary of what was implemented and which files were changed
