# Design Anti-Patterns

## Quick Rules
- Avoid purple-to-blue gradients, neon accents, glassmorphism, and decorative blobs — they signal "AI generated"
- Don't use pure black (#000) or pure white (#fff) — always tint slightly
- Don't nest cards inside cards — flatten the hierarchy (max 3 levels: page > section > card)
- Don't center body text or use ALL CAPS for more than short labels
- Don't set body text below 16px on mobile or use light gray text (#999) on white backgrounds
- Don't add hover animations to every element — animate only interactive elements
- Don't use more than 3 colors plus neutrals

Things AI models commonly get wrong. Avoid ALL of these.

## Patterns

### Typography
- Don't use Inter, Roboto, or system-ui as the only font — they scream "default"
- Don't use more than 3 font sizes on a single screen
- Don't set body text below 16px on mobile
- Don't use light gray text (#999, text-gray-400) on white backgrounds — insufficient contrast
- Don't center-align body text — left-align for readability
- Don't use ALL CAPS for more than short labels or buttons
- Don't mix font families without a clear purpose (heading vs body)

### Color
- Don't use pure black (#000) or pure white (#fff) — always tint slightly
- Don't use purple-to-blue gradients — it's the #1 "AI made this" tell
- Don't use rainbow gradients for backgrounds
- Don't use low-contrast text on colored backgrounds
- Don't use more than 3 colors plus neutrals
- Don't apply opacity to text to make it lighter — use an actual lighter color
- Don't use saturated colors for large background areas — desaturate or use tints

### Layout
- Don't nest cards inside cards — flatten the hierarchy
- Don't wrap everything in rounded-corner cards with shadows
- Don't use equal spacing everywhere — create visual hierarchy with varied spacing
- Don't center everything on the page — use left-aligned layouts with clear reading flow
- Don't use a grid of identical cards as the default layout for everything
- Don't make every section full-width — constrain text to readable line lengths (45-75 characters)
- Don't stack more than 3 levels of visual nesting (page > section > card is the max)

### Components
- Don't add glassmorphism (backdrop-blur) unless it serves a purpose
- Don't add glowing effects, neon accents, or "futuristic" styling
- Don't default to dark mode with gradient accents
- Don't add hover animations to every element — animate only interactive elements
- Don't use icon + text + icon patterns on every list item
- Don't put borders AND shadows AND background color on the same element — pick one separation method
- Don't make buttons with more than 2 visual treatments (e.g., gradient + shadow + border + icon)

### General
- Don't add decorative elements (circles, blobs, dots) that serve no purpose
- Don't make every button a gradient — use solid colors, reserve gradients for primary CTA
- Don't use stock-photo-style hero sections with overlaid text
- Don't add a "powered by AI" aesthetic (glowing borders, tech-y fonts, circuit patterns)
- Don't create "dashboard-style" layouts with too many metrics visible at once
- Don't use placeholder images or icons as final design — every visual element must be intentional
- Don't add a loading skeleton for everything — only for content that takes > 200ms to load
- Don't use toast notifications for every action — reserve for errors and important confirmations

## Don't

### Patterns That Signal "AI Generated"
- Purple/blue gradient backgrounds with white text and rounded cards
- Dark backgrounds with neon accent colors and glassmorphism
- Hero sections with a large heading, subtitle, and two buttons (primary + secondary)
- Feature grids with icon + heading + paragraph in each card, all identical size
- Decorative blobs or circles floating in the background
- Excessive use of shadows on every card and button
- Emoji-heavy headings
- "Get Started" and "Learn More" as the only CTAs
- Testimonial carousels with star ratings and stock photos
- Footer with 4 columns of links regardless of actual content needs
