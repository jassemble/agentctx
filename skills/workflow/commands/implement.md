Implement a feature from an approved spec.

## Steps

1. Read the spec file: $ARGUMENTS
   - If no argument provided, check `.agentctx/specs/INDEX.md` for approved specs and ask which one
   - **Enforcement gate**: Parse the spec's YAML frontmatter and check the `status` field:
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

3. **Agent check** — does a specialist exist for this work?
   - Check `.agentctx/context/agents/` for installed agents relevant to this spec's domain
   - If no matching agent is installed, run `agentctx agents list --all` to check available specialists
   - If a relevant specialist exists, suggest adding it: `agentctx sync --agent {slug}`
   - Read the matching agent's file to adopt their expertise before implementing
   - For multi-domain specs: suggest `/build-with-team` with agents assigned per domain

4. Check if this spec affects multiple areas (backend + frontend, API + mobile, etc.):
   - Look at the "Affected Files" section and child specs
   - If it spans multiple areas, ask the user:
     "This spec affects multiple areas. How would you like to proceed?
      1. Implement here sequentially (default)
      2. Use `/orchestrate` for step-by-step multi-area implementation with checkpoints
      3. Use `/build-with-team` for parallel implementation with agent teams"
   - If the user chooses 2 or 3, hand off to that command and stop

5. Read the project context:
   - Read `CLAUDE.md` for conventions and patterns
   - Read relevant module files in `.agentctx/context/modules/` for existing code
   - Read `.agentctx/context/architecture.md` for structure conventions
   - If the spec has a `parent_spec` field, read the parent spec for full context

6. Create a feature branch (if not already on one):
   ```bash
   git checkout -b feat/{NNNN}-{name}
   ```

7. Transition spec status to `in-progress`:
   - Read the spec file and update its YAML frontmatter:
     - Set `status: in-progress`
     - Set `updated` to today's date
     - Set `branch: feat/{NNNN}-{name}`
     - Append to `history` array: `{ status: in-progress, date: today, branch: feat/{NNNN}-{name} }`
   - **Do NOT rename the file** — the filename never changes
   - Update `.agentctx/specs/INDEX.md` status column to `in-progress`

8. Convert acceptance criteria into a task list and plan the implementation order

9. Implement each task:
   - Follow conventions from CLAUDE.md
   - Reuse existing functions from modules/ documentation
   - Put new files in the correct location per architecture.md
   - After each significant subtask, consider a mini-checkpoint

10. After implementation, update module files:
   - Create or update `.agentctx/context/modules/{feature}.md` with:
     - Key files created/modified
     - Exported functions/components
     - Dependencies on other modules
   - Document: key files, exports, dependencies
   - Update `.agentctx/context/status.md` with the completed work
   - Log any architectural decisions in `.agentctx/context/decisions.md`

11. Transition spec status to `completed`:
    - Read the spec file and update its YAML frontmatter:
      - Set `status: completed`
      - Set `updated` to today's date
      - Append to `history` array: `{ status: completed, date: today, checkpoint: cp-{NNNN}-done }`
    - **Do NOT rename the file** — the filename never changes
    - Update `.agentctx/specs/INDEX.md` status column to `completed`

12. Auto-checkpoint:
    ```bash
    git add -A
    git commit -m "checkpoint: spec-{NNNN} implementation complete"
    git tag cp-{NNNN}-done
    ```

13. Print a summary:
    ```
    Implementation complete: {title}
    Spec: .agentctx/specs/{NNNN}-{name}.md
    Checkpoint: cp-{NNNN}-done
    Module file: .agentctx/context/modules/{feature}.md

    Files changed:
    - {list of files created/modified}

    Next step: Run /review .agentctx/specs/{NNNN}-{name}.md to validate
    ```

## Important
- NEVER implement from a draft spec — approval is required
- Always create a feature branch before making changes
- Status transitions happen in frontmatter only — NEVER rename spec files
- Each status transition must be recorded in the frontmatter `history` array
- Update module files so future features can discover and reuse this code
- The auto-checkpoint at the end creates a rollback point: `cp-{NNNN}-done`
- If implementation fails partway, the user can `/rollback` to the pre-implementation state
