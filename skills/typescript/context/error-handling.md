# TypeScript — Error Handling

## Typed Error Classes

Extend `Error` with specific fields for programmatic handling:

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly statusCode: number = 500,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export enum ErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  RATE_LIMITED = 'RATE_LIMITED',
  UPSTREAM_FAILURE = 'UPSTREAM_FAILURE',
}

// Specific subclasses for common cases
export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} ${id} not found`, ErrorCode.NOT_FOUND, 404);
    this.name = 'NotFoundError';
  }
}
```

Use `instanceof` to narrow error types in catch blocks:

```typescript
try {
  await getUser(id);
} catch (error) {
  if (error instanceof NotFoundError) {
    return res.status(404).json({ error: error.message });
  }
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ code: error.code });
  }
  throw error;  // Re-throw unknown errors — never swallow them
}
```

## Result Pattern

For functions where errors are **expected** (validation, parsing, lookups), return a discriminated union instead of throwing:

```typescript
type Result<T, E = Error> =
  | { ok: true; data: T }
  | { ok: false; error: E };

function parseConfig(raw: string): Result<Config, ValidationError> {
  const parsed = configSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return { ok: false, error: new ValidationError(parsed.error) };
  }
  return { ok: true, data: parsed.data };
}

// Caller is forced to handle both cases
const result = parseConfig(input);
if (!result.ok) {
  logger.warn('Invalid config', { error: result.error });
  return defaults;
}
const config = result.data;  // type-narrowed to Config
```

### When to use Result vs throw

| Use Result | Use throw |
|-----------|-----------|
| Validation / parsing | Unrecoverable system errors |
| Business rule violations | Database connection failures |
| "Not found" that's a normal case | Programming bugs (invariant violations) |
| When the caller should choose recovery | At system boundaries (middleware catches) |

## Error Boundaries in React

For client-side errors, use React error boundaries at strategic points:

```tsx
// In Next.js App Router, error.tsx is an error boundary
// app/dashboard/error.tsx
'use client';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

Place error boundaries at **section granularity** — one around the dashboard, one around settings — not around every component.

## Rules

1. **Never swallow errors silently** — empty catch blocks hide bugs.
2. **Catch at system boundaries** — API route handlers, event handlers, middleware. Don't scatter try/catch through business logic.
3. **Log with context** — include the operation, relevant IDs, and the error. Don't log just `error.message`.
4. **Rethrow unknown errors** — if a catch block handles `AppError`, always rethrow anything that isn't an `AppError`.
5. **Don't use exceptions for flow control** — if "not found" is a normal case, use the Result pattern.

```typescript
// Bad — try/catch in business logic for expected case
try {
  const user = await getUser(id);
} catch {
  const user = await createUser(id);
}

// Good — explicit check
const existing = await findUser(id);
const user = existing ?? await createUser(id);
```
