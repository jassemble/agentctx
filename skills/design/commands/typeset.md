Fix typography issues — fonts, hierarchy, readability.

## Steps

1. Reference `references/design/typography.md`
2. Audit current typography in $ARGUMENTS:
   - Font count: max 2 families (one display, one body)
   - Size scale: consistent steps (not arbitrary sizes)
   - Line height: 1.5 for body, 1.2 for headings
   - Measure (line length): 45-75 characters for body text
3. Fix heading hierarchy:
   - h1 → h2 → h3 without skipping levels
   - Clear visual distinction between each level
   - Headings should be scannable — the story reads from headings alone
4. Fix readability:
   - Body text ≥ 16px on mobile
   - Sufficient contrast (4.5:1 minimum)
   - No light gray text on white backgrounds
   - Left-align body text (not center)
5. Fix details:
   - Orphans/widows in important headings
   - Letter spacing: slight negative for large text
   - Font weight: 400 body, 600-700 headings (avoid 100-300)

## Rule
Good typography is invisible. If users notice the fonts, something is wrong.
