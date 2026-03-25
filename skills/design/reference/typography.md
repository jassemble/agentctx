# Typography Reference

## Font Pairing Strategies

Pair a serif with a sans-serif for contrast, or use a single font family with weight variation.
Limit to 2 font families maximum. More than 2 creates visual noise.

Proven pairings:
- Headings: serif or display font / Body: clean sans-serif
- Headings: geometric sans / Body: humanist sans
- Single family with bold headings (600-700) and regular body (400)

Avoid pairing two fonts that are too similar — if they don't create obvious contrast,
use one font instead.

## Size Scale

Use a consistent modular scale. Recommended sizes in px:

| Token       | Size | Usage                        |
|-------------|------|------------------------------|
| text-xs     | 12   | Captions, fine print         |
| text-sm     | 14   | Secondary text, labels       |
| text-base   | 16   | Body text (default)          |
| text-lg     | 18   | Emphasized body, lead text   |
| text-xl     | 20   | Small headings, card titles  |
| text-2xl    | 24   | Section headings (h3)        |
| text-3xl    | 30   | Page section headings (h2)   |
| text-4xl    | 36   | Page titles (h1)             |
| text-5xl    | 48   | Hero headings                |
| text-6xl    | 64   | Display text, landing pages  |

Don't invent sizes between these steps. If 24px is too small and 30px too large,
use 24px with a heavier weight rather than 27px.

## Line Height

- Body text: 1.5 (24px at 16px font size) — optimum for readability
- Headings: 1.2 to 1.3 — tighter for visual cohesion
- Small text (12-14px): 1.5 to 1.6 — slightly looser for legibility
- Display text (48px+): 1.0 to 1.1 — tight for visual impact

## Letter Spacing

- Large text (24px+): slight negative tracking (-0.01em to -0.02em)
- Body text (14-18px): default (0) — do not adjust
- Small text (12px): slight positive tracking (0.01em) for legibility
- All caps text: always add positive tracking (0.05em to 0.1em)

## Font Weight

- 400 (Regular): body text, descriptions, paragraphs
- 500 (Medium): labels, navigation items, subtle emphasis
- 600 (Semi-bold): subheadings, card titles, interactive element labels
- 700 (Bold): primary headings, strong emphasis

Avoid 100-300 (thin/light) — they look broken on low-DPI screens and small sizes.
Avoid 800-900 (extra-bold/black) for body text — reserve for display/hero text only.
