# Color Reference

## Semantic Color Naming

Define colors by their role, not their hue. This makes theming and dark mode trivial.

| Token              | Purpose                         |
|--------------------|---------------------------------|
| --color-primary    | Primary brand / interactive     |
| --color-secondary  | Supporting brand / accents      |
| --color-error      | Errors, destructive actions     |
| --color-warning    | Warnings, attention needed      |
| --color-success    | Success states, confirmations   |
| --color-info       | Informational, neutral feedback |

Always pair each semantic color with a matching text color that passes contrast:
`--color-error` with `--color-on-error`, `--color-primary` with `--color-on-primary`.

## Neutral Scale

Build a neutral scale from 50 (lightest) to 950 (darkest) with a warm or cool tint.
Never use pure gray (#808080) — always shift slightly warm (yellow/orange undertone)
or cool (blue undertone) to match the brand palette.

- 50: page background
- 100: surface/card background
- 200: hover states, dividers
- 300: borders
- 400: placeholder text, disabled states
- 500: secondary text
- 600: icons
- 700: body text (dark mode surface)
- 800: headings
- 900: primary text
- 950: near-black (avoid pure #000)

## OKLCH and HSL Over Hex

Use OKLCH (or HSL as fallback) for defining colors. These formats make relationships
between colors visible and adjustable:

```css
--color-primary: oklch(55% 0.15 250);       /* readable: lightness, chroma, hue */
--color-primary-light: oklch(70% 0.10 250); /* same hue, lighter */
--color-primary-dark: oklch(40% 0.18 250);  /* same hue, darker */
```

Hex values (#3B82F6) obscure the relationship between color variants.
OKLCH makes it obvious: change lightness for tints/shades, chroma for saturation.

## Dark Mode

Don't just invert the light palette. Dark mode requires deliberate adjustments:
- Reduce contrast — use gray-100 (not white) for text on gray-900 backgrounds
- Desaturate primary colors by 10-20% to avoid vibrating on dark surfaces
- Elevate surfaces with lighter grays rather than shadows (shadows are invisible on dark)
- Maintain the same semantic color meanings — error is still red, success still green

## Accessible Color Combinations

Tested pairings that pass WCAG AA (4.5:1 ratio):

| Background      | Text           | Ratio  |
|-----------------|----------------|--------|
| white (#fafafa) | gray-800       | 12.5:1 |
| white (#fafafa) | gray-600       | 5.7:1  |
| gray-100        | gray-900       | 13.2:1 |
| blue-600        | white          | 5.4:1  |
| red-700         | white          | 6.1:1  |
| green-700       | white          | 4.8:1  |
| gray-900        | gray-100       | 13.2:1 |
| gray-900        | gray-400       | 5.1:1  |

Unsafe pairings to avoid: gray-400 on white (2.6:1), gray-500 on gray-100 (3.1:1),
any saturated color as text on a colored background without testing.
