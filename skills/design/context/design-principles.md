# Design Principles

## Quick Rules
- Use design tokens (CSS custom properties / theme variables) for all colors, spacing, and font sizes — never hardcode
- Use a 4px base spacing scale (4, 8, 12, 16, 24, 32, 48, 64, 96px) — no arbitrary pixel values
- Limit to 2 font families max; use font weight (400 body, 600-700 headings) for hierarchy
- Name colors by purpose (`--color-primary`, `--color-error`, `--color-text-secondary`) not by hue
- Meet WCAG AA contrast: 4.5:1 for normal text, 3:1 for large text and UI components
- Mobile-first: base styles for mobile, add complexity with min-width breakpoints
- Keep transitions under 300ms; always respect `prefers-reduced-motion`
- One icon set only — never mix icon libraries; size consistently at 16/20/24px

## Patterns

### Design Tokens Over Hardcoded Values

Never hardcode colors, spacing, font sizes, or breakpoints directly in components.
Define all visual properties as design tokens (CSS custom properties or theme variables).
This ensures consistency across the entire interface and makes sweeping changes trivial.

```css
/* Do this */
color: var(--color-text-primary);
padding: var(--space-4);

/* Not this */
color: #333;
padding: 16px;
```

### Consistent Spacing Scale

Use a 4px base unit. All spacing values should be multiples of 4:
4, 8, 12, 16, 24, 32, 48, 64, 96px.

Never use arbitrary values like 13px, 17px, or 22px. If something looks "off,"
adjust to the nearest value on the scale rather than nudging by a pixel.

Maintain vertical rhythm by keeping line heights and margins on the same grid.

### Typography Hierarchy

Limit to a maximum of 2 font families — one for headings, one for body text.
A single well-chosen font family is often better than two mediocre ones.

Establish a clear size scale and stick to it. Every text element on a page should
map to a named size in the type scale. If you need a size that is not in the scale,
reconsider the design rather than adding ad hoc sizes.

Use font weight to create hierarchy: 400 for body, 600 or 700 for headings.
Avoid ultralight weights (100-300) — they cause readability issues on most screens.

### Color: Semantic Naming

Name colors by purpose, not by hue:
- `--color-primary`, `--color-secondary` for brand
- `--color-error`, `--color-warning`, `--color-success`, `--color-info` for feedback
- `--color-text-primary`, `--color-text-secondary`, `--color-text-muted` for text
- `--color-surface`, `--color-surface-raised`, `--color-border` for surfaces

This decouples the design system from specific color values and makes theming
(including dark mode) straightforward.

### Contrast and Accessibility

Meet WCAG AA contrast ratios as a minimum:
- 4.5:1 for normal text (under 18px or 14px bold)
- 3:1 for large text (18px+ or 14px+ bold)
- 3:1 for UI components and graphical objects (icons, borders, focus rings)

Test contrast with real content, not placeholder text. Gray text on light backgrounds
is the most common failure — always verify light grays pass.

### Responsive Design: Mobile-First

Write base styles for mobile, then add complexity with min-width media queries.
Set breakpoints where the content breaks, not at device widths. Common device
breakpoints (768px, 1024px) are a starting point, not a rule.

Content should be readable at any viewport width. Never require horizontal scrolling
for primary content.

### Motion and Animation

Respect `prefers-reduced-motion` — always provide a reduced or no-motion alternative.
Keep transition durations under 300ms for UI feedback (hover, focus, toggle).
Entrance animations should be 200-400ms. Exit animations should be faster than entrance.

Use easing curves: `ease-out` for entrances, `ease-in` for exits, `ease-in-out` for
position changes. Never use `linear` for UI transitions.

### Icons

Choose one icon set and use it consistently. Do not mix icons from different libraries
(e.g., Heroicons with Font Awesome with Material Icons). Mixed icon styles create
visual incoherence that users perceive as low quality.

Ensure icons are sized consistently (16px, 20px, 24px) and optically aligned with
adjacent text. Use `currentColor` for icon fill so they inherit text color.

## Don't

- Don't hardcode colors, spacing, or font sizes — use design tokens
- Don't use arbitrary spacing values (13px, 17px) — stick to the 4px scale
- Don't use more than 2 font families or ultralight weights (100-300)
- Don't use color names based on hue (`--blue-500`) as semantic tokens — name by purpose
- Don't ship without checking WCAG AA contrast ratios on all text
- Don't write desktop-first styles — always start mobile-first
- Don't use `linear` easing or skip `prefers-reduced-motion` support
- Don't mix icon libraries or use inconsistent icon sizes
