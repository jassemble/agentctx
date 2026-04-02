---
relevant-when: writing any code, reviewing code, or making architectural decisions
---

# Code Quality — Common Rules

## Quick Rules
- Write code that reads like prose — clear names, obvious flow, minimal comments
- Functions do one thing — if you need "and" to describe it, split it
- Keep functions under 30 lines — extract helpers when longer
- Prefer immutability — const by default, mutate only when necessary
- Delete dead code — don't comment it out, git has history
- DRY applies to knowledge, not code — three similar lines beats a premature abstraction

## Patterns

### Naming
- Variables: describe what it holds (`userCount`, not `n`)
- Functions: describe what it does (`validateEmail`, not `check`)
- Booleans: use is/has/can prefix (`isActive`, `hasPermission`)
- Constants: UPPER_SNAKE for true constants, camelCase for config
- Files: match the primary export name

### Code Organization
- Group related code together — imports, types, constants, functions, exports
- Export only what's needed — keep internal helpers private
- One concept per file — split when a file serves two distinct purposes
- Order functions by dependency — callees before callers, or top-down

### Dependencies
- Prefer standard library over third-party when equivalent
- Audit new dependencies for maintenance, size, and security
- Pin versions in production, use ranges in libraries
- Remove unused dependencies immediately

## Don't
- Don't add comments that repeat what code already says
- Don't create abstractions for single-use patterns
- Don't optimize before measuring — profile first, then optimize
- Don't suppress linter warnings — fix the code or document the exception
- Don't modify linter/formatter configs to make errors go away
