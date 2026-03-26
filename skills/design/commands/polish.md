Final design polish pass before shipping.

## Prerequisites

1. **Check for a recent audit**:
   - Look for a recent `/audit` report in the conversation or project
   - If no recent audit exists, run `/audit` first to identify issues
   - Polish should address audit findings, not guess at problems

2. **Read conventions**:
   - Read `.agentctx/context/conventions/anti-patterns.md` — ensure no AI slop patterns remain

## Steps

### Alignment and Spacing
- Check that all elements align to the spacing grid (4px base)
- Verify consistent padding within similar components (all cards, all buttons, all inputs)
- Check that section spacing creates clear visual hierarchy (larger gaps between sections, smaller within)
- Verify margin consistency between sibling elements

### Typography
- Verify heading hierarchy is correct and consistent (h1 > h2 > h3, no skipped levels)
- Check for orphaned words (single words on the last line of a paragraph) in key headings
- Verify line lengths are within readable range (45-75 characters for body text)
- Check that font weights create clear distinction (400 body, 600-700 headings)

### Visual Consistency
- Verify border-radius values are consistent (same radius on same-level elements)
- Check shadow consistency across elevation levels
- Verify icon sizes are consistent (16/20/24px) and optically aligned with text
- Check that interactive elements have consistent padding and sizing

### Responsive Behavior
- Test at common breakpoints: 320px, 375px, 768px, 1024px, 1440px
- Verify no horizontal overflow at any width
- Check that touch targets are 44px+ on mobile viewports
- Verify navigation adapts correctly

### Dark Mode (if applicable)
- Verify all colors adapt correctly (no hardcoded light-mode colors)
- Check contrast ratios in dark mode
- Verify images and illustrations work in both modes
- Check that shadows are visible but subtle in dark mode

### Anti-Pattern Check
- No purple-to-blue gradients
- No unnecessary glassmorphism
- No decorative blobs or circles without purpose
- No nested cards inside cards
- No excessive shadows on every element
- No more than 3 colors plus neutrals

## Output

List every fix made with file path and description:
```
## Polish Report

### Fixes Applied
1. `src/components/Card.tsx` — normalized border-radius from 8px/10px/12px to consistent 8px
2. `src/components/Button.tsx` — increased mobile padding to meet 44px touch target
3. ...

### Remaining Issues (could not auto-fix)
- ...
```

## Important
- Make only micro-fixes — do not redesign components
- Each fix should be small and obviously correct
- If unsure about a change, skip it and list it as a remaining issue
- Test that changes don't break existing responsive behavior
