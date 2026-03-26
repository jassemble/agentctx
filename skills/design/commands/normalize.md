Normalize the design system by standardizing tokens, variables, and spacing patterns.

## Steps

1. **Read reference material first**:
   - Read `.agentctx/context/references/typography.md`
   - Read `.agentctx/context/references/color.md`
   - Read `.agentctx/context/references/spacing-layout.md`

2. **Inventory existing design tokens**:
   - Find all CSS custom properties / theme variables
   - Find all Tailwind config customizations (if applicable)
   - Find all hardcoded color, spacing, and font-size values in components
   - Catalog what exists: token names, values, usage counts

3. **Identify inconsistencies**:
   - Multiple font sizes that should be the same scale step (e.g., 14px and 15px both used for body)
   - Spacing values outside the 4px scale (13px, 17px, 22px)
   - Mixed color formats (hex, rgb, hsl, named colors for the same purpose)
   - Duplicate tokens with different names but same purpose
   - Hardcoded values that should use existing tokens
   - Colors named by hue (`--blue-500`) used as semantic tokens

4. **Create a normalization plan** — present before executing:
   ```
   ## Normalization Plan

   ### Font Sizes (X inconsistencies)
   - 14px, 15px → var(--text-sm) [14px]
   - 17px → var(--text-base) [16px]

   ### Spacing (X inconsistencies)
   - 13px → var(--space-3) [12px]
   - 22px → var(--space-6) [24px]

   ### Colors (X inconsistencies)
   - #333, #334, rgb(51,51,51) → var(--color-text-primary)
   - #999, text-gray-400 → var(--color-text-muted)

   ### New Tokens Needed
   - var(--color-surface-raised) — currently using #f5f5f5 in 8 places
   ```

5. **Execute normalization**:
   - Replace hardcoded values with design tokens
   - Consolidate duplicate tokens
   - Round spacing values to nearest scale step
   - Standardize color format (prefer CSS custom properties)
   - Ensure all components reference the same token set

6. **Verify after changes**:
   - Check that no visual regressions occurred
   - Confirm all replaced values map correctly
   - Run the app and spot-check key pages

## Important

- Present the normalization plan and get confirmation before making changes
- Prefer the nearest scale value over the exact original value
- If a value doesn't fit the scale, it may be intentional — flag it rather than force-fitting
- Do not rename existing public API tokens (component props, exported theme values)
