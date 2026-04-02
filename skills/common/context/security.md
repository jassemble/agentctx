---
relevant-when: handling user input, authentication, external data, secrets, or security-sensitive code
---

# Security — Common Rules

## Quick Rules
- Never interpolate user input into SQL, HTML, shell commands, or template strings
- Validate and sanitize at system boundaries (API handlers, form processors, webhooks)
- Use parameterized queries for all database access — no string concatenation
- Never log secrets, tokens, passwords, or PII
- Store secrets in environment variables, never in source code
- Use HTTPS for all external communication
- Apply principle of least privilege to all access controls

## Patterns

### Input Validation
Validate shape and type at the boundary, then trust internally:
- API handlers: validate request body schema before processing
- Form data: validate on server even if client validates
- File uploads: validate MIME type, size, and extension
- URL parameters: validate format and range

### Authentication & Authorization
- Hash passwords with bcrypt/argon2 — never store plaintext
- Use short-lived tokens (JWT with expiry, session cookies with maxAge)
- Check authorization on every protected route, not just the frontend
- Implement rate limiting on auth endpoints

### Secret Management
- Use `.env` files locally, secret managers in production
- Never commit `.env`, credentials, or API keys
- Rotate secrets regularly, revoke on exposure
- Use different secrets per environment (dev/staging/prod)

## Don't
- Don't trust client-side validation alone
- Don't use `eval()`, `new Function()`, or `dangerouslySetInnerHTML` with user data
- Don't disable CORS without explicit documented reason
- Don't expose stack traces or internal errors to users
- Don't store sensitive data in localStorage or cookies without encryption
- Don't use MD5 or SHA1 for password hashing
