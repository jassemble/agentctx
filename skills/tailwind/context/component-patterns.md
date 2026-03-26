---
relevant-when: creating reusable UI components, design system, variants, extracting patterns
---

# Tailwind CSS — Component Patterns

## Quick Rules
- Create React components for reuse instead of extracting classes with `@apply`
- Use `class-variance-authority` (CVA) for type-safe component variants
- Stick to Tailwind's default spacing scale — don't mix values within the same visual group
- Extend the theme in `tailwind.config.ts` for project-specific tokens instead of arbitrary values
- Only use `@apply` for styling elements you don't control (Markdown HTML, third-party widgets)
- Use `prose` from `@tailwindcss/typography` for user-generated/Markdown content
- Bridge design tokens to Tailwind via CSS variables: `surface: 'hsl(var(--surface))'`

## Patterns

### Avoid `@apply` — Use Component Composition

`@apply` extracts utilities into CSS classes. This **defeats the purpose** of utility-first CSS and creates maintenance overhead. Only use it for:

- Styling elements you don't control (e.g., Markdown-rendered HTML, third-party widgets)
- Global base styles that truly apply everywhere (e.g., focus rings on all inputs)

```css
/* Acceptable — styling uncontrolled HTML */
.prose a {
  @apply text-blue-600 underline hover:text-blue-800;
}

/* Bad — just use a React component instead */
.btn-primary {
  @apply rounded-lg bg-blue-600 px-4 py-2 text-white;
}
```

Instead, create a React component:

```tsx
function Button({ variant = "primary", ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant }))} {...props} />
  );
}
```

### Variant Patterns with CVA

Use `class-variance-authority` to define component variants with type-safe props:

```typescript
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  // Base classes — always applied
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-blue-600 text-white hover:bg-blue-700",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        outline: "border border-gray-300 bg-transparent hover:bg-gray-100",
        ghost: "hover:bg-gray-100",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
```

This pattern gives you: type-safe variant props, easy composition, and a single source of truth for each component's visual states.

### Consistent Spacing Scale

Stick to the default spacing scale for consistency. The most commonly used values:

| Class | Value | Use for |
|-------|-------|---------|
| `p-1` / `gap-1` | 4px | Icon padding, tight gaps |
| `p-2` / `gap-2` | 8px | Inside badges, between inline elements |
| `p-3` / `gap-3` | 12px | Compact cards, small form fields |
| `p-4` / `gap-4` | 16px | Standard card padding, list gaps |
| `p-6` / `gap-6` | 24px | Section padding, form field spacing |
| `p-8` / `gap-8` | 32px | Page section spacing |

**Rule**: don't mix values from different parts of the scale in the same visual group. If cards use `p-4`, all cards should use `p-4`.

### Design Tokens via tailwind.config

Extend the theme for project-specific values rather than using arbitrary values throughout:

```javascript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        surface: 'hsl(var(--surface))',        // CSS variable bridge
        'surface-hover': 'hsl(var(--surface-hover))',
      },
      borderRadius: {
        DEFAULT: '0.5rem',                      // override base radius
      },
      fontSize: {
        'body': ['0.9375rem', { lineHeight: '1.5rem' }],
      },
    },
  },
};
```

Reference tokens in classes: `bg-brand-600`, `text-surface`, `rounded`.

### Prose Styling with Typography Plugin

For rendering user-generated content or Markdown, use `@tailwindcss/typography`:

```tsx
<article className="prose prose-lg dark:prose-invert max-w-none">
  <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
</article>
```

- `prose` applies readable typography defaults to raw HTML.
- `prose-invert` flips colors for dark mode.
- Override specific elements: `prose-headings:font-bold prose-a:text-blue-600`.
- `max-w-none` removes the default max-width if your layout already constrains width.

## Don't

- Don't extract components just to reduce class count — only extract for reuse or readability
- Don't mix Tailwind with inline styles or CSS modules in the same component
- Don't create a `styles.css` with custom classes when Tailwind utilities cover the case
- Don't use fixed widths (`w-[342px]`) — use responsive utilities and max-width constraints
- Don't apply dark mode classes without testing — `dark:bg-gray-900` on nested elements can cause issues
