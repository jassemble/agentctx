Create a Business Requirement Document (BRD) from a feature description.

A BRD captures the **business "why"** before the technical "what." Use this for features that span multiple areas or need stakeholder alignment. For small single-team tasks, use `/spec` or `/rfp` instead.

## Steps

1. **Read existing context** before writing:
   - Check `.agentctx/specs/INDEX.md` for related specs
   - Read `.agentctx/context/modules/` to understand what exists
   - Read `.agentctx/context/architecture.md` for system context

2. Parse the feature description: $ARGUMENTS

3. Determine the next BRD number by reading `.agentctx/specs/INDEX.md`

4. Create the BRD at `.agentctx/specs/{NNNN}-{kebab-name}.md` using the template at `.agentctx/specs/_templates/brd-template.md`
   - **No status prefix in filename** — status is tracked in YAML frontmatter only

5. Fill in ALL sections:
   - **Frontmatter**: Set `id`, `title`, `status: draft`, `created` and `updated` to today's date, `priority`, and initialize `history` array with `[{ status: draft, date: today }]`
   - **Business Context**: Why this feature matters — the problem, not the solution
   - **User Stories**: Real user scenarios in "As a... I want... so that..." format
   - **Acceptance Criteria**: Business-level, not technical (e.g., "users can reset their password" not "POST /api/reset returns 200")
   - **Affected Areas**: Which parts of the system are impacted
   - **Success Metrics**: How to measure if the feature worked (e.g., "30% reduction in support tickets about password resets")
   - **Priority**: P0 (critical/blocking) through P3 (nice-to-have)
   - **Dependencies**: What must exist before this can be built

6. Update `.agentctx/specs/INDEX.md` with the new BRD entry

7. Print the BRD path and suggest next steps:
   ```
   Created: .agentctx/specs/{NNNN}-user-auth.md

   Next steps:
   1. Review the BRD and run /approve to approve it
   2. Run /breakdown to decompose into team-specific specs
   3. Run /implement or /build-with-team on the child specs
   ```

## BRD vs Spec

| | BRD | Spec |
|---|---|---|
| Level | Business ("why" + "what") | Technical ("how") |
| Audience | Stakeholders, PMs, leads | Developers |
| Creates | User stories, success metrics | API contracts, DB schemas |
| Decomposes into | Team specs via /breakdown | Tasks via /implement |
| Use when | Multi-area feature, needs alignment | Single-team task, clear scope |
