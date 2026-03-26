Push interfaces past conventional limits with technically extraordinary effects.

## Steps

1. Assess if the project benefits from "wow factor" — not every project needs this
2. Consider high-impact techniques:
   - Scroll-linked animations (parallax, reveal on scroll)
   - 3D transforms and perspective effects
   - WebGL/Canvas for particle systems or data visualization
   - Advanced CSS: clip-path animations, blend modes, container queries
   - View Transitions API for page transitions
3. Implementation rules:
   - Performance budget: effects must not degrade Core Web Vitals
   - Progressive enhancement: works without JS, enhanced with it
   - Respect `prefers-reduced-motion` — provide static fallback
   - Test on low-end devices — if it lags on a $200 phone, simplify
4. Reference `references/design/motion.md` for animation principles

## Warning
Overdrive effects should enhance, not distract. If users notice the effect more than the content, tone it down.
