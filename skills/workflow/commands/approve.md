Approve a draft spec, gating it for implementation.

**Why approval matters:** Approval is the gate between planning and building. Without it, implementation may start on incomplete or misguided specs, wasting effort. An approved spec is a contract — the team agrees on _what_ will be built before _how_ begins. Draft specs can change freely; approved specs require a reason to modify.

## Steps

1. Determine the spec to approve:
   - If argument provided, use that path: $ARGUMENTS
   - Otherwise, read `specs/INDEX.md` and find specs with status `draft`
   - If multiple drafts exist, list them and ask the user which to approve
   - If no drafts exist, tell the user and stop

2. Read the spec file

3. Present a summary for review:
   - **Title**: from the spec frontmatter
   - **Requirements count**: number of numbered items in the Requirements section
   - **Acceptance criteria count**: number of checkbox items in the Acceptance Criteria section
   - **Affected files**: list from the spec

4. Show the full spec content so the user can review it

5. Ask the user: "Do you approve this spec for implementation? (yes/no)"
   - If the user says no or requests changes, stop and suggest they edit the spec

6. If approved:
   - Determine the new filename: replace `draft-` prefix with `approved-` in the filename
   - Check if the file is tracked by git: `git ls-files --error-unmatch {spec-path} 2>/dev/null`
     - If tracked: `git mv {old-path} {new-path}`
     - If not tracked: rename the file using standard mv
   - Update the spec frontmatter: set `status: approved`

7. Update `specs/INDEX.md`:
   - Find the row matching this spec number
   - Change the Status column from `draft` to `approved`
   - Update the filename/link if INDEX.md references it

8. Print confirmation:
   ```
   Spec {NNNN} approved: {title}
   File: specs/approved-{NNNN}-{name}.md
   Next step: Run /implement specs/approved-{NNNN}-{name}.md
   ```

## Important
- Only `draft` specs can be approved — if the spec is already approved, in-progress, or completed, tell the user
- Do not modify the spec content during approval — only the status and filename change
- If the spec has no acceptance criteria, warn the user that this will make review difficult
