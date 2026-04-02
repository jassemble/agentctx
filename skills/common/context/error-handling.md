---
relevant-when: writing try/catch, error boundaries, validation, or handling failures
---

# Error Handling — Common Rules

## Quick Rules
- Handle errors at the appropriate level — don't catch and ignore
- Use typed/custom errors for domain-specific failures
- Log errors with context (what happened, where, what input caused it)
- Return user-friendly messages to clients, detailed errors to logs
- Fail fast on unrecoverable errors — don't silently continue
- Always handle promise rejections and async errors

## Patterns

### Error Classification
Separate recoverable from fatal:
- **Recoverable**: invalid input, network timeout, rate limit → retry or return error to user
- **Fatal**: missing config, database connection lost, corrupt state → crash with clear message
- **Expected**: 404 not found, 401 unauthorized → handle gracefully in normal flow

### Error Boundaries
Place error boundaries at natural architectural seams:
- Route/page level: catch rendering errors, show fallback UI
- API handler level: catch all, return structured error response
- Service level: catch external failures, translate to domain errors
- Global level: catch unhandled errors, log and alert

### Structured Error Responses
Return consistent error shapes from APIs:
- Include: status code, error type/code, human-readable message
- Omit: stack traces, internal details, database errors
- Use standard HTTP status codes (400, 401, 403, 404, 422, 500)

## Don't
- Don't catch errors just to re-throw them without adding context
- Don't use `catch {}` (empty catch) — at minimum log the error
- Don't expose internal error messages to end users
- Don't use error handling for control flow (if/else is clearer)
- Don't swallow errors in async functions — unhandled rejections crash Node.js
