# Tailwind CSS — Utility Classes

## Utility-First Approach

Write styles directly in markup using utility classes. Do **not** extract into custom CSS classes until a pattern is repeated across 3+ distinct components and the design is stable.

```tsx
// Good — utilities inline
<button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
  Save
</button>

// Bad — premature abstraction
<button className="btn-primary">Save</button>  // with @apply in CSS
```

## Class Ordering Convention

Follow a consistent ordering for readability. Group utilities in this order:

1. **Layout** — `flex`, `grid`, `block`, `hidden`, `relative`, `absolute`, `z-10`
2. **Sizing** — `w-full`, `h-12`, `max-w-lg`, `min-h-screen`
3. **Spacing** — `p-4`, `px-6`, `m-2`, `mt-8`, `gap-4`, `space-y-2`
4. **Typography** — `text-sm`, `font-bold`, `leading-tight`, `tracking-wide`, `truncate`
5. **Colors/Backgrounds** — `text-gray-900`, `bg-white`, `border-gray-200`
6. **Borders/Rings** — `border`, `rounded-lg`, `ring-2`, `ring-offset-2`
7. **Effects** — `shadow-md`, `opacity-50`, `transition-colors`, `duration-200`
8. **State modifiers** — `hover:`, `focus:`, `active:`, `disabled:`

```tsx
<div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md">
```

## Responsive Design

Tailwind is **mobile-first**. Unprefixed utilities apply to all sizes. Prefixed utilities apply at that breakpoint **and above**.

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
```

| Prefix | Breakpoint | Applies at |
|--------|-----------|------------|
| `sm:` | 640px | >=640px |
| `md:` | 768px | >=768px |
| `lg:` | 1024px | >=1024px |
| `xl:` | 1280px | >=1280px |
| `2xl:` | 1536px | >=1536px |

## Dark Mode

Use the `dark:` prefix. Tailwind uses the `class` strategy by default — toggle `dark` on the `<html>` element.

```tsx
<div className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
```

Pair with `next-themes` or a similar library to manage the toggle and persist preference.

## Arbitrary Values

Use square brackets for one-off values not in the default scale:

```tsx
<div className="top-[117px] w-[calc(100%-2rem)] bg-[#1a1a2e] text-[13px]">
```

- Use sparingly — if you reach for arbitrary values often, extend the theme in `tailwind.config` instead.
- Arbitrary properties: `[mask-type:luminance]` for CSS properties without utility classes.

## Important Modifier

Prefix with `!` to add `!important`:

```tsx
<div className="!mt-0">  {/* overrides any other mt-* */}
```

Use only when you cannot control the source of conflicting styles (e.g., third-party component libraries).

## Conditional Classes

Use `clsx` or `cn()` (a thin wrapper combining `clsx` + `tailwind-merge`) for conditional class application:

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

```tsx
<button className={cn(
  "rounded-lg px-4 py-2 text-sm font-medium",
  variant === "primary" && "bg-blue-600 text-white hover:bg-blue-700",
  variant === "ghost" && "text-gray-600 hover:bg-gray-100",
  disabled && "pointer-events-none opacity-50"
)}>
```

`tailwind-merge` resolves conflicting utilities — `cn("px-4", "px-6")` → `"px-6"`, not `"px-4 px-6"`.

## Don't

- Don't use `@apply` to extract single-use class combinations — only for truly reusable patterns
- Don't override Tailwind's spacing scale with arbitrary values (`mt-[13px]`) when a scale value works (`mt-3`)
- Don't use `!important` modifier unless overriding third-party styles — fix the specificity instead
- Don't create custom utility classes when Tailwind already has them — check the docs first
- Don't use `text-gray-500` on colored backgrounds without checking contrast ratios
