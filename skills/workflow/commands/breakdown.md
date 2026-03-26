Break down an approved spec into team-specific child specs.

## Steps

1. Read the parent spec: $ARGUMENTS
   - If no argument provided, check `.agentctx/specs/INDEX.md` for approved specs and ask which one
   - The spec MUST be `approved` — if it is `draft`, tell the user to run `/approve` first
   - If the spec is already broken down (has child specs in INDEX.md), warn the user

2. Read the parent spec fully — understand:
   - All requirements (numbered list)
   - All acceptance criteria
   - All affected files and directories
   - Dependencies

3. Determine which teams are affected by analyzing:
   - **Backend**: if affected files include `src/api/`, `src/services/`, `src/server/`, `src/routes/`, database files, or requirements mention API endpoints, services, database changes
   - **Frontend**: if affected files include `src/pages/`, `src/components/`, `src/app/`, `src/views/`, or requirements mention UI, pages, forms, components
   - **Mobile**: if affected files include `ios/`, `android/`, `src/screens/`, `src/native/`, or requirements mention mobile, native, push notifications
   - **QA**: always include QA — every feature needs tests
   - **DevOps**: if requirements mention deployment, infrastructure, environment variables, CI/CD, monitoring

4. Read the next available spec number from `.agentctx/specs/INDEX.md`

5. For each affected team, create a child spec:
   - Use the template from `.agentctx/specs/_templates/{team}-spec.md`
   - If the template does not exist, use `.agentctx/specs/_templates/feature-spec.md` as fallback
   - Set the filename: `.agentctx/specs/draft-{NNNN}-{parent-kebab-name}-{team}.md`
   - Fill in the frontmatter:
     - `id`: next available number
     - `title`: "{Parent Title} — {Team}" (e.g., "User Auth — Backend")
     - `status: draft`
     - `created`: today's date
     - `team`: the team name (backend, frontend, mobile, qa, devops)
     - `parent_spec`: the parent spec's ID number
     - `branch`: same as parent spec's branch
   - Extract ONLY the requirements relevant to this team
   - Create team-specific acceptance criteria from the parent's criteria
   - List only the affected files relevant to this team
   - In Dependencies, link back to the parent spec and list other child specs this depends on

6. Update `.agentctx/specs/INDEX.md` with all child specs:
   - Add each child spec as a new row
   - Include a note or column indicating the parent spec ID

7. Print a summary:
   ```
   Breakdown of spec {NNNN}: {title}

   Created {N} child specs:
   - {NNNN} {title} — Backend (specs/draft-NNNN-name-backend.md)
   - {NNNN} {title} — Frontend (specs/draft-NNNN-name-frontend.md)
   - {NNNN} {title} — QA (specs/draft-NNNN-name-qa.md)

   Next steps:
   1. Review each child spec and adjust requirements
   2. Run /approve on each child spec
   3. Run /build-with-team to implement with coordinated agents
   ```

## Important
- Each child spec should be independently implementable by its team
- QA spec should reference ALL other child specs — it validates the whole feature
- Requirements that span multiple teams should appear in each relevant child spec with a note about the cross-team dependency
- Do NOT duplicate the entire parent spec — extract only what each team needs
