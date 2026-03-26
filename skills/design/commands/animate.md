Add purposeful motion that communicates state changes, provides feedback, and guides attention.

## Prerequisites

1. **Read reference material**:
   - Read `.agentctx/context/references/motion.md`

2. Identify what to animate:
   - If argument provided, focus on that area: $ARGUMENTS
   - Otherwise, scan for static interactions that lack feedback or jarring transitions

## Steps

### Identify Animation Opportunities

- **Missing feedback**: button clicks, form submissions, toggles without visual acknowledgment
- **Jarring transitions**: instant show/hide, abrupt route changes, sudden state updates
- **Unclear relationships**: spatial or hierarchical connections that are not obvious
- Prioritize: one well-orchestrated experience beats scattered animations everywhere

### Timing and Easing

- **100-150ms**: instant feedback (button press, toggle)
- **200-300ms**: state changes (hover, menu open/close)
- **300-500ms**: layout changes (accordion, modal)
- **500-800ms**: entrance animations (page load choreography)
- Exit animations should be ~75% of entrance duration
- Use `ease-out-quart` / `ease-out-expo` — never bounce or elastic easing

### Implementation Categories

- **Micro-interactions**: subtle hover scale (1.02-1.05), click feedback, input focus glow
- **State transitions**: fade + slide for show/hide (not instant), height transitions for expand/collapse
- **Entrance choreography**: stagger element reveals with 100-150ms delays, scroll-triggered reveals
- **Navigation**: crossfade between routes, slide indicator on tabs, smooth carousel transforms

### Technical Rules

- Animate only `transform` and `opacity` (GPU-accelerated) — avoid layout properties
- Use `will-change` sparingly for known expensive animations
- Target 60fps on mid-range devices

### Accessibility

- Always respect `prefers-reduced-motion` — provide a non-animated alternative
- Never block interaction during animations unless intentional

## Important

- Every animation needs a reason — motion without purpose is decoration
- Do not animate everything; animation fatigue makes interfaces exhausting
- Do not use durations over 500ms for feedback — it feels laggy
