Fix layout and spacing — visual rhythm, alignment, whitespace distribution.

## Prerequisites

1. **Read reference material**:
   - Read `.agentctx/context/references/spacing-layout.md`

2. Identify what to fix:
   - If argument provided, focus on that area: $ARGUMENTS
   - Otherwise, scan for pages and components with spacing inconsistencies

## Steps

### Assess Current Layout

- **Spacing**: is it consistent or arbitrary? Is all spacing identical (no rhythm)?
- **Visual hierarchy**: squint test — can you identify primary, secondary, and groupings?
- **Grid and structure**: is there a clear underlying structure or does it feel random?
- **Density**: too cramped or too sparse for the content type?

### Establish a Spacing System

- Use a consistent spacing scale (4px base: 4, 8, 12, 16, 24, 32, 48, 64, 96px)
- Use `gap` for sibling spacing instead of margins — eliminates margin collapse issues
- Apply `clamp()` for fluid spacing that adapts on larger screens
- Name tokens semantically: `--space-xs` through `--space-xl`

### Create Visual Rhythm

- **Tight grouping** for related elements (8-12px between siblings)
- **Generous separation** between distinct sections (48-96px)
- Vary spacing within sections — not every row needs the same gap
- Break predictable centered-content patterns with asymmetric compositions when appropriate

### Choose the Right Layout Tool

- **Flexbox** for 1D layouts: nav bars, button groups, card contents, most component internals
- **CSS Grid** for 2D layouts: page structure, dashboards, data-dense interfaces
- Do not default to Grid when Flexbox with `flex-wrap` would be simpler
- Use `repeat(auto-fit, minmax(280px, 1fr))` for responsive grids without breakpoints

### Strengthen Visual Hierarchy

- Use space to communicate importance — generous whitespace draws the eye
- Create clear content groupings through proximity and separation
- Build a semantic z-index scale (dropdown > sticky > modal-backdrop > modal > toast > tooltip)

## Important

- Do not use arbitrary spacing values outside the scale
- Do not make all spacing equal — variety creates hierarchy
- Do not wrap everything in cards — spacing and alignment create grouping naturally
- Do not nest cards inside cards — use spacing and dividers for internal hierarchy
