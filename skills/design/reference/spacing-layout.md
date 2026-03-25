# Spacing and Layout Reference

## Base Unit and Scale

Use a 4px base unit. All spacing values must come from this scale:

| Token     | Value | Common use                            |
|-----------|-------|---------------------------------------|
| space-1   | 4px   | Inline icon gap, tight element pairs  |
| space-2   | 8px   | Related element spacing, input padding|
| space-3   | 12px  | Small component padding               |
| space-4   | 16px  | Default component padding, list gaps  |
| space-6   | 24px  | Card padding, form group spacing      |
| space-8   | 32px  | Section internal padding              |
| space-12  | 48px  | Between content groups                |
| space-16  | 64px  | Major section separation              |
| space-24  | 96px  | Hero/page-level vertical spacing      |

Never use values outside this scale. If 24px is too small and 32px too large,
use 24px — the constraint creates consistency.

## Component Internal Padding vs External Margin

Components should define their own internal padding but never set their own
external margin. The parent layout is responsible for spacing between children.

```css
/* Component: owns its padding */
.card { padding: var(--space-6); }

/* Parent: owns spacing between children */
.card-grid { gap: var(--space-6); }
```

This prevents margin collapse issues and makes components reusable in any context.

## Section Spacing

Use generous spacing (64-96px) between major page sections. Tight spacing makes
pages feel cramped and hurts content hierarchy.

- Between hero and first section: 64-96px
- Between major sections: 64px minimum
- Between subsections: 32-48px
- Between related elements within a section: 16-24px

Vertical space is free — use it. Horizontal space is constrained — be deliberate.

## Content Width Constraints

- Prose/text content: max-width of 65ch (roughly 600-700px) for optimal readability
- Page layout container: 1200-1440px max-width with 16-24px horizontal padding
- Form inputs: 400-500px max-width for single-column forms
- Cards in a grid: let the grid define card width, don't set a fixed card width

```css
.prose { max-width: 65ch; }
.container { max-width: 1200px; margin-inline: auto; padding-inline: var(--space-6); }
```

## Vertical Rhythm

Maintain a consistent baseline grid by ensuring all vertical spacing (margins,
paddings, line heights) resolves to multiples of the base unit (4px).

- Body text: 16px font, 24px line-height (6 base units)
- Heading margin-bottom: 16px (4 base units)
- Paragraph margin-bottom: 24px (6 base units) to match line height
- List item spacing: 8px (2 base units)

This creates a subtle but perceivable visual order that signals quality.
