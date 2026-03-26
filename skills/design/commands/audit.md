Run a design quality audit across the current codebase.

## MANDATORY PREPARATION

1. Read `conventions/design/principles.md` — Quick Rules section
2. Read `conventions/design/anti-patterns.md`
3. Check if `conventions/design/design-context.md` has been filled in
   - If still template placeholders: ask the user about target audience, brand personality, aesthetic direction, and accessibility requirements
   - Fill in the design context before proceeding
   - Save the updated file

## Prerequisites

1. **Read conventions before auditing** — this is mandatory:
   - Read `.agentctx/context/conventions/design/design-principles.md`
   - Read `.agentctx/context/conventions/design/anti-patterns.md`
   - These define what "correct" looks like for this project

2. Identify the UI files to audit:
   - If argument provided, audit that file/directory: $ARGUMENTS
   - Otherwise, scan for components, pages, and layout files

## Audit Dimensions

Score each dimension **0-4** (0 = critical issues, 1 = major issues, 2 = needs work, 3 = good, 4 = excellent):

### 1. Accessibility
- Color contrast meets WCAG AA (4.5:1 text, 3:1 UI components)
- All interactive elements have focus-visible styles
- Images have meaningful alt text (or `alt=""` for decorative)
- Form inputs have associated labels (not just placeholders)
- Touch targets are at least 44x44px
- `prefers-reduced-motion` is respected for animations

### 2. Performance
- Images use responsive srcset, lazy loading where appropriate
- No layout shifts from dynamically loaded content
- Animations use only `transform` and `opacity`
- No heavy computations in render paths
- Font loading strategy is defined (swap, optional, preload)

### 3. Theming
- All colors use design tokens / CSS custom properties
- All spacing uses the spacing scale (no arbitrary pixel values)
- Typography uses the type scale consistently
- Dark mode works correctly if applicable
- No hardcoded color values in component styles

### 4. Responsive
- Mobile-first approach (base styles + min-width queries)
- Content is readable at all viewport widths (320px to 1440px+)
- No horizontal scrolling on primary content
- Navigation adapts appropriately across breakpoints
- Touch vs pointer input is handled where relevant

### 5. Anti-Patterns
- No "AI slop" patterns (purple gradients, glassmorphism, decorative blobs)
- No nested cards inside cards
- No more than 3 colors plus neutrals
- No centered body text or ALL CAPS paragraphs
- No mixed icon libraries
- Body text is 16px+ on mobile

## Output Format

Generate a structured report:

```
## Design Audit Report

**Overall Score: X/20** (sum of all dimensions)

| Dimension      | Score | Summary                    |
|----------------|-------|----------------------------|
| Accessibility  | X/4   | ...                        |
| Performance    | X/4   | ...                        |
| Theming        | X/4   | ...                        |
| Responsive     | X/4   | ...                        |
| Anti-Patterns  | X/4   | ...                        |

### Issues Found

#### P0 — Critical (must fix before shipping)
- ...

#### P1 — High (fix soon)
- ...

#### P2 — Medium (fix when convenient)
- ...

#### P3 — Low (nice to have)
- ...

### Recommended Next Steps
- /normalize — if theming score < 3
- /polish — if anti-patterns score < 3
- /harden — if accessibility score < 3
- /critique — for deeper UX analysis
- /optimize — if performance score < 3
```

## Important

- Do NOT fix any issues during the audit — only document them
- Be specific: include file paths, line numbers, and the exact problem
- Compare against project conventions, not just general best practices
- If a dimension is not applicable (e.g., no dark mode), score it N/A and note why
