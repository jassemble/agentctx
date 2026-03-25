Implement a feature from an approved spec.

## Steps

1. Read the spec file: $ARGUMENTS
   - If no argument provided, check `specs/INDEX.md` for approved specs and ask which one
   - **Enforcement gate**: Check the spec's `status` field in the frontmatter:
     - If `draft` — STOP. Tell the user: "This spec is still a draft. Run `/approve {spec-path}` to approve it before implementation. Approval ensures requirements are reviewed and agreed upon."
     - If `in-progress` — warn the user it's already being implemented. Ask if they want to continue.
     - If `completed` — tell the user it's already done. Ask if they want to re-implement.
     - Only `approved` status should proceed without warning.

2. **Mandatory context loading** — before writing any code:
   - Read `CLAUDE.md` fully — it contains conventions, anti-patterns, and the module index
   - Read ALL module files listed in the Module Index that relate to this spec's affected areas
   - Read `.agentctx/context/architecture.md` for directory conventions
   - Read `.agentctx/context/decisions.md` for prior decisions
   - This step is NOT optional — skipping it leads to duplicate code and convention violations

3. Check if this spec affects multiple areas (backend + frontend, API + mobile, etc.):
   - Look at the "Affected Files" section and child specs
   - If it spans multiple areas, ask the user:
     "This spec affects multiple areas. How would you like to proceed?
      1. Implement here sequentially (default)
      2. Use `/orchestrate` for step-by-step multi-area implementation with checkpoints
      3. Use `/build-with-team` for parallel implementation with agent teams"
   - If the user chooses 2 or 3, hand off to that command and stop

4. Read the project context:
   - Read `CLAUDE.md` for conventions and patterns
   - Read relevant module files in `.agentctx/context/modules/` for existing code
   - Read `.agentctx/context/architecture.md` for structure conventions
   - If the spec has a `parent_spec` field, read the parent spec for full context

5. Create a feature branch (if not already on one):
   ```bash
   git checkout -b feat/{NNNN}-{name}
   ```

6. Transition spec status to `in-progress`:
   - Rename the spec file from `approved-{NNNN}-{name}.md` to `in-progress-{NNNN}-{name}.md`
     - Use `git mv` if the file is tracked, otherwise regular mv
   - Update the `status` field in the spec frontmatter to `in-progress`
   - Update `specs/INDEX.md` status column to `in-progress`

7. Convert acceptance criteria into a task list and plan the implementation order

8. Implement each task:
   - Follow conventions from CLAUDE.md
   - Reuse existing functions from modules/ documentation
   - Put new files in the correct location per architecture.md
   - After each significant subtask, consider a mini-checkpoint

9. After implementation, update module files:
   - Create or update `.agentctx/context/modules/{feature}.md` with:
     - Key files created/modified
     - Exported functions/components
     - Dependencies on other modules
   - Document: key files, exports, dependencies
   - Update `.agentctx/context/status.md` with the completed work
   - Log any architectural decisions in `.agentctx/context/decisions.md`

10. Transition spec status to `completed`:
    - Rename the spec file from `in-progress-{NNNN}-{name}.md` to `completed-{NNNN}-{name}.md`
      - Use `git mv` if the file is tracked, otherwise regular mv
    - Update the `status` field in the spec frontmatter to `completed`
    - Update `specs/INDEX.md` status column to `completed`

11. Auto-checkpoint:
    ```bash
    git add -A
    git commit -m "checkpoint: spec-{NNNN} implementation complete"
    git tag cp-{NNNN}-done
    ```

12. Print a summary:
    ```
    Implementation complete: {title}
    Spec: specs/completed-{NNNN}-{name}.md
    Checkpoint: cp-{NNNN}-done
    Module file: .agentctx/context/modules/{feature}.md

    Files changed:
    - {list of files created/modified}

    Next step: Run /review specs/completed-{NNNN}-{name}.md to validate
    ```

## Important
- NEVER implement from a draft spec — approval is required
- Always create a feature branch before making changes
- Update module files so future features can discover and reuse this code
- The auto-checkpoint at the end creates a rollback point: `cp-{NNNN}-done`
- If implementation fails partway, the user can `/rollback` to the pre-implementation state
