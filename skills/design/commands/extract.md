Extract reusable components from repeated patterns.

## Steps

1. Read `conventions/design/principles.md` and `architecture.md`
2. Scan the target area ($ARGUMENTS) for patterns used 2+ times:
   - Similar button styles, card layouts, list items
   - Repeated form field patterns
   - Consistent header/footer structures
3. For each pattern, create a shared component:
   - Define clear props interface
   - Support variants (size, color, state)
   - Include default values for common use
4. Replace all instances with the new component
5. Document in `modules/{component-name}.md`:
   - Props and variants
   - Usage examples
   - Where it's used

## Important
- Don't extract prematurely — wait for 2+ real usages
- Keep component API minimal — add props only when needed
- Follow project naming conventions from `architecture.md`
