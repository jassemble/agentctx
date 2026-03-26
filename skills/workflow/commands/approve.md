Approve a draft spec, gating it for implementation.

**Why approval matters:** Approval is the gate between planning and building. Without it, implementation may start on incomplete or misguided specs, wasting effort. An approved spec is a contract — the team agrees on _what_ will be built before _how_ begins. Draft specs can change freely; approved specs require a reason to modify.

## Steps

1. Determine the spec to approve:
   - If argument provided, use that path: $ARGUMENTS
   - Otherwise, read `.agentctx/specs/INDEX.md` and find specs with status `draft`
   - If multiple drafts exist, list them and ask the user which to approve
   - If no drafts exist, tell the user and stop

2. Read the spec file and parse its YAML frontmatter

3. Verify the frontmatter `status` field is `draft`:
   - If status is not `draft` (already approved, in-progress, or completed), tell the user and stop

4. Present a summary for review:
   - **Title**: from the spec frontmatter
   - **Requirements count**: number of numbered items in the Requirements section
   - **Acceptance criteria count**: number of checkbox items in the Acceptance Criteria section
   - **Affected files**: list from the spec

5. Show the full spec content so the user can review it

6. Ask the user: "Do you approve this spec for implementation? (yes/no)"
   - If the user says no or requests changes, stop and suggest they edit the spec

7. If approved, update the spec file frontmatter:
   - Set `status: approved`
   - Set `updated` to today's date
   - Append to `history` array: `{ status: approved, date: today }`
   - **Do NOT rename the file** — the filename never changes

8. Update `.agentctx/specs/INDEX.md`:
   - Find the row matching this spec number
   - Change the Status column from `draft` to `approved`
   - Update the Updated column to today's date

9. Print confirmation:
   ```
   Spec {NNNN} approved: {title}
   File: .agentctx/specs/{NNNN}-{name}.md
   Next step: Run /implement .agentctx/specs/{NNNN}-{name}.md
   ```

## Important
- Only `draft` specs can be approved — check frontmatter status, not filename
- Do not modify the spec content during approval — only the frontmatter status, updated date, and history change
- Do NOT rename the file — status is tracked in frontmatter only
- If the spec has no acceptance criteria, warn the user that this will make review difficult
