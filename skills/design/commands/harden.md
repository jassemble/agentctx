Harden the UI by adding resilience for edge cases, error handling, and state management.

## Steps

1. **Inventory all user-facing components**:
   - If argument provided, focus on that area: $ARGUMENTS
   - Otherwise, scan for pages, forms, lists, and interactive components

2. **Error handling for all operations**:
   - Every API call has error handling with user-friendly messages
   - Network failures show "Check your connection and try again" not stack traces
   - Server errors show "Something went wrong on our end" with a retry action
   - Permission errors explain what access is needed

3. **Empty states**:
   - Every list/table/grid has a meaningful empty state
   - Empty states explain the value of the feature and provide a clear action
   - Example: "No projects yet. Create your first project to get started." not "No data"
   - Search with no results suggests adjustments: "No results for 'xyz'. Try a broader search."

4. **Loading states**:
   - All async operations show loading feedback
   - Use skeleton screens for content areas, spinners for actions
   - Loading text is specific: "Saving your changes..." not "Loading..."
   - Long operations set expectations: "This usually takes about 30 seconds"

5. **Overflow and edge cases**:
   - Long text truncates with ellipsis, not layout-breaking overflow
   - Long names/titles have `text-overflow: ellipsis` or multi-line clamping
   - Large numbers format correctly (1,234 not 1234; "1.2k" for compact display)
   - Lists with many items handle pagination or virtualization
   - Images have fallbacks for broken src

6. **Interactive element states**:
   - All buttons have: default, hover, focus-visible, active, disabled, loading states
   - All form inputs have: default, focus, filled, error, disabled states
   - Disabled elements have reduced opacity and `cursor: not-allowed`
   - Loading buttons show a spinner and prevent double-submission

7. **Form validation**:
   - Required fields are marked and validated on blur
   - Error messages appear below the field with `aria-describedby`
   - Errors explain the format needed: "Enter a date as MM/DD/YYYY" not "Invalid input"
   - Real-time validation for passwords (strength meter) and email format
   - Form submits are prevented while validation errors exist

8. **Resilience testing checklist** — verify each:
   - [ ] Slow network (3G throttling) — does the UI remain usable?
   - [ ] Failed API calls — are errors caught and displayed?
   - [ ] Missing/null data — do components handle undefined gracefully?
   - [ ] Browser back/forward — does state persist correctly?
   - [ ] Rapid clicking — are duplicate submissions prevented?

9. **i18n readiness**:
   - No hardcoded user-facing strings in JSX/templates
   - All text content uses translation keys or is extracted to constants
   - Layouts accommodate 30% text expansion (for German, Finnish)
   - Date, number, and currency formatting uses locale-aware functions

## Output

List every hardening change with file path:
```
## Hardening Report

### Changes Applied
1. `src/components/UserList.tsx` — added empty state with create action
2. `src/api/client.ts` — added error boundary with retry logic
3. ...

### Remaining Gaps
- [Component/area] — [what's still needed]
```

## Important
- Hardening should not change the visual design — only add resilience
- Prefer graceful degradation over hiding content
- Every error state should offer the user a way forward (retry, go back, contact support)
- Test with real edge cases, not just the happy path
