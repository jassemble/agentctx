Optimize UI performance for faster loading and smoother interactions.

## Steps

1. **Image optimization**:
   - Check all images for appropriate sizing (no 2000px images displayed at 400px)
   - Verify responsive images use `srcset` with width descriptors
   - Check that below-the-fold images use `loading="lazy"`
   - Verify image formats (prefer WebP/AVIF with fallbacks)
   - Check for missing `width` and `height` attributes (causes layout shifts)

2. **Layout stability (CLS)**:
   - Check for elements that shift after page load (images, ads, dynamic content)
   - Verify all media has explicit dimensions or aspect-ratio
   - Check that fonts don't cause layout shift (use `font-display: swap` or `optional`)
   - Look for content injected after initial render that pushes other content down

3. **Largest Contentful Paint (LCP)**:
   - Identify the LCP element on key pages (usually hero image or main heading)
   - Check that LCP resources are preloaded (`<link rel="preload">`)
   - Verify no render-blocking resources delay LCP
   - Check server response time for the initial HTML

4. **Render performance**:
   - Identify unnecessary re-renders (React: missing memo, inline objects in props)
   - Check for heavy computations in render functions (move to useMemo/useCallback)
   - Verify lists use proper keys (not array index for dynamic lists)
   - Check for large component trees that could be split

5. **Bundle optimization**:
   - Identify large dependencies that could be dynamically imported
   - Check for unused imports and dead code
   - Verify code splitting at route boundaries
   - Look for duplicate dependencies in the bundle

6. **Font loading**:
   - Verify fonts are preloaded for critical text
   - Check `font-display` strategy (swap for body, optional for decorative)
   - Limit font variations loaded (only weights and styles actually used)
   - Consider using system font stack where custom fonts aren't essential

7. **Critical CSS**:
   - Check if above-the-fold CSS is inlined or prioritized
   - Verify non-critical CSS is deferred
   - Look for large CSS files that could be split per route

## Output

```
## Performance Report

### Quick Wins (high impact, low effort)
- ...

### Optimizations Applied
1. [file] — [what was optimized]
2. ...

### Recommendations (requires further investigation)
- ...
```

## Important
- Measure before and after — don't optimize blindly
- Focus on user-perceived performance, not just metrics
- Quick wins first: lazy loading, image sizing, font preload
- Don't sacrifice code readability for micro-optimizations
