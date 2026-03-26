Adapt designs for different devices and screen sizes.

## Prerequisites

1. **Read reference material**:
   - Read `.agentctx/context/references/responsive.md`

2. Identify what to adapt:
   - If argument provided, focus on that area: $ARGUMENTS
   - Otherwise, scan for components and pages with responsive issues

## Steps

### Assess Current Responsive Behavior

- What was the design built for? (Desktop-first? Mobile-first?)
- What assumptions were made? (Mouse input? Large screen? Fast connection?)
- Where does the layout break between 320px and 1440px?

### Mobile Adaptation

- Single-column layout where multi-column breaks down
- Touch targets at least 44x44px with adequate spacing between them
- Bottom sheets instead of dropdowns; thumbs-first control placement
- Progressive disclosure — prioritize primary content, tuck secondary into tabs or accordions
- Body text 16px minimum; shorter, more concise copy

### Tablet Adaptation

- Two-column or master-detail layouts; adapt based on orientation
- Support both touch and pointer input
- Side navigation drawers; multi-column forms where appropriate

### Desktop Adaptation

- Use horizontal space — multi-column layouts, persistent side navigation
- Add hover states, keyboard shortcuts, right-click context menus
- Show more information upfront; richer data tables and visualizations
- Constrain content width (`max-width`) — don't stretch to 4K

### Implementation

- Use CSS Grid / Flexbox for layout reflow; container queries where available
- Use `clamp()` for fluid sizing between min and max
- Responsive images with `srcset` and `<picture>`; lazy-load below the fold
- Test at breakpoints: 320px, 375px, 768px, 1024px, 1440px

## Important

- Adaptation is not just scaling — rethink the experience for each context
- Do not hide core functionality on mobile; if it matters, make it work
- Do not use different information architecture across contexts
- Test on real devices, not just browser DevTools
