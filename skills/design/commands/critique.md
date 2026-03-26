Perform a UX design critique from the user's perspective.

## Prerequisites

1. **Read reference material**:
   - Read `.agentctx/context/references/interaction.md`
   - Read `.agentctx/context/references/ux-writing.md`

2. Identify what to critique:
   - If argument provided, focus on that page/flow: $ARGUMENTS
   - Otherwise, critique the primary user-facing screens

## Evaluation Areas

### Visual Hierarchy
- Can a user identify the most important element within 3 seconds?
- Is there a clear reading flow (top-left to bottom-right for LTR)?
- Does the squint test pass? (blur the layout — can you still see groupings?)
- Are there competing elements fighting for attention?

### Cognitive Load
- How many decisions does the user face on each screen?
- Are there more than 7 options visible at once without grouping?
- Is information progressively disclosed or dumped all at once?
- Are labels and actions self-explanatory without tooltips?

### Information Density
- Is there enough whitespace to let content breathe?
- Are related items grouped and unrelated items separated?
- Does the layout feel cramped or sparse at common viewport sizes?

### Persona Testing

Evaluate the interface from three perspectives:

**First-time user:**
- Can they understand what this does within 10 seconds?
- Is the primary action obvious?
- Are there helpful empty states and onboarding hints?

**Power user:**
- Are there keyboard shortcuts or efficient paths?
- Can they accomplish frequent tasks quickly?
- Is there unnecessary friction for common operations?

**Accessibility user:**
- Can the interface be navigated by keyboard alone?
- Do screen readers convey the correct structure and state?
- Are focus indicators visible and meaningful?

### State Coverage
- **Empty states**: Do they explain what to do, not just "No items"?
- **Error states**: Do they explain what happened and how to fix it?
- **Loading states**: Are they specific ("Saving draft...") not generic ("Loading...")?
- **Success states**: Do they confirm what happened?
- **Edge cases**: Long text, many items, missing data, slow connections

### UX Writing
- Are button labels specific ("Save changes" not "OK")?
- Are error messages helpful (what happened + how to fix)?
- Is terminology consistent (not "Delete" in one place and "Remove" in another)?
- Are destructive actions clearly labeled with consequences?

## Output Format

```
## UX Critique

### Summary
One paragraph overall assessment.

### Findings

#### Critical (blocks usability)
- [Finding]: description, affected users, suggestion

#### Important (degrades experience)
- [Finding]: description, affected users, suggestion

#### Minor (polish opportunities)
- [Finding]: description, suggestion

### Strengths
- What the interface does well (always include positives)

### Recommended Actions
1. Highest-impact fix first
2. ...
```

## Important
- Evaluate from the USER's perspective, not the developer's
- Focus on whether the interface helps users accomplish their goals
- Be specific — "the button is confusing" is not helpful; "the 'Submit' button should say 'Create Account' to match the user's mental model" is
- Always include strengths alongside criticisms
