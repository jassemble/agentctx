Add moments of joy that serve a purpose — delight that distracts is worse than none.

## Prerequisites

1. **Read reference material**:
   - Read `.agentctx/context/references/interaction.md`

2. Identify delight opportunities:
   - If argument provided, focus on that area: $ARGUMENTS
   - Otherwise, scan for success states, empty states, loading screens, and key interactions

## Steps

### Find Natural Delight Moments

- **Success states**: checkmark animations on save, celebration for milestones
- **Empty states**: playful illustrations, personality in copy ("Your canvas awaits")
- **Loading states**: specific, encouraging messages — not generic spinners
- **Interactions**: satisfying hover lifts, toggle feedback, drag-and-drop snap animations
- **Easter eggs**: hidden discoveries for curious users (Konami code, console messages)

### Delight Principles

- Delight moments should be quick (under 1 second) and never delay core functionality
- Match the brand personality: banks can be warm, but not wacky
- Vary responses over time so delight stays fresh after repeated use
- Celebrate big wins (confetti for milestones), stay subtle for routine actions

### Implementation

- Button hover: subtle `translateY(-2px)` lift with `ease-out-quart`
- Success: animated checkmark draw, gentle scale pulse, brief highlight flash
- Loading copy: write messages specific to the product, not cliched AI filler
- Empty states: custom illustrations over stock icons; clear CTA alongside personality

## Important

- If users notice the delight more than accomplishing their goal, you have gone too far
- Respect `prefers-reduced-motion` — always provide non-animated alternatives
- Do not sacrifice performance for delight; lazy-load delight features
- Do not make every interaction delightful — special moments should be special
