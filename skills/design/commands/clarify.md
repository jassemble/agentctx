Improve UX copy — fix vague labels, confusing errors, unclear instructions.

## Prerequisites

1. **Read reference material**:
   - Read `.agentctx/context/references/ux-writing.md`

2. Identify what to clarify:
   - If argument provided, focus on that area: $ARGUMENTS
   - Otherwise, scan for buttons, error messages, empty states, and form labels

## Steps

### Find Clarity Problems

- Vague buttons: "Submit", "OK", "Click here" — replace with specific actions
- Bad errors: "Error occurred", "Invalid input" — explain what happened and how to fix it
- Empty states: "No items" — explain value and provide a clear CTA
- Missing context: labels without guidance, forms without format hints
- Inconsistent terminology: "Delete" in one place, "Remove" in another

### Fix by Category

**Buttons and CTAs**:
- Describe the action specifically: "Create Account" not "Submit"
- Use verb + noun format: "Save changes", "Send invitation", "Delete project"

**Error messages**:
- Explain what happened + how to fix: "Email needs an @ symbol. Try: name@example.com"
- Do not blame the user: "This field is required" not "You forgot to fill this in"

**Empty states**:
- State what will appear + why it matters + how to get started
- Example: "No projects yet. Create your first project to get started."

**Loading states**:
- Be specific: "Saving your changes..." not "Loading..."
- Set expectations for long operations: "This usually takes about 30 seconds"

**Confirmation dialogs**:
- State the specific action and consequences: "Delete 'Project Alpha'? This cannot be undone."
- Use clear button labels: "Delete project" not "Yes"

### Consistency Pass

- Use the same term for the same concept throughout the entire interface
- Pick one voice and tone — match the brand personality consistently

## Important

- Good UX writing is invisible — users should understand immediately without noticing the words
- Every piece of text should help users accomplish their goals
- Be specific, be concise, be active, be helpful
- Do not use humor for errors — be empathetic instead
