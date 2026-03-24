# TypeScript — Type Patterns

## Interface vs Type

Use **`interface`** for object shapes that may be extended. Use **`type`** for unions, intersections, mapped types, and computed types.

```typescript
// Interface — object shapes, extendable
interface User {
  id: string;
  name: string;
  email: string;
}

interface AdminUser extends User {
  role: 'admin';
  permissions: string[];
}

// Type — unions, intersections, computed
type Status = 'idle' | 'loading' | 'success' | 'error';
type ApiResponse<T> = { data: T; meta: PaginationMeta } & TimestampFields;
type UserKeys = keyof User;  // 'id' | 'name' | 'email'
```

## Discriminated Unions

Use a shared literal field to model states. This is the **preferred pattern for state machines** — the compiler narrows exhaustively on the discriminant.

```typescript
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

function render(state: AsyncState<User[]>) {
  switch (state.status) {
    case 'idle':    return <Empty />;
    case 'loading': return <Spinner />;
    case 'success': return <UserList users={state.data} />;  // data is narrowed
    case 'error':   return <Alert message={state.error.message} />;
  }
}
```

## `as const` and `satisfies`

```typescript
// as const — preserves literal types instead of widening to string
const ROUTES = {
  home: '/',
  dashboard: '/dashboard',
  settings: '/settings',
} as const;

type Route = typeof ROUTES[keyof typeof ROUTES];  // '/' | '/dashboard' | '/settings'

// satisfies — type-checks without widening the inferred type
const config = {
  port: 3000,
  host: 'localhost',
  debug: true,
} satisfies Record<string, string | number | boolean>;
// config.port is still `number` (not `string | number | boolean`)
```

Use `satisfies` when you want to validate a value matches a type **while preserving the narrow inferred type**.

## Generic Constraints

```typescript
// Constrain generics to express requirements
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// Constrain to objects with an id
function findById<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find(item => item.id === id);
}
```

## Branded Types

Prevent mixing structurally-identical types (e.g., UserId vs PostId):

```typescript
type Brand<T, B extends string> = T & { readonly __brand: B };

type UserId = Brand<string, 'UserId'>;
type PostId = Brand<string, 'PostId'>;

function getUser(id: UserId): Promise<User> { /* ... */ }

const userId = 'abc' as UserId;
const postId = 'xyz' as PostId;

getUser(userId);   // OK
getUser(postId);   // Type error — PostId is not assignable to UserId
```

## Avoid `any` — Use `unknown` with Narrowing

```typescript
// Bad — defeats type checking entirely
function parse(input: any) { return input.data; }

// Good — forces you to narrow before use
function parse(input: unknown): Data {
  if (typeof input === 'object' && input !== null && 'data' in input) {
    return (input as { data: Data }).data;
  }
  throw new Error('Invalid input');
}
```

When receiving untyped data from external sources (API responses, JSON parsing), use `unknown` and validate with Zod or manual narrowing.

## Record vs Index Signatures

```typescript
// Record — use when keys are a known union
type Permissions = Record<'read' | 'write' | 'delete', boolean>;

// Index signature — use when keys are arbitrary strings
interface Cache {
  [key: string]: CacheEntry | undefined;  // undefined accounts for missing keys
}
```

Enable `noUncheckedIndexedAccess` in tsconfig to force handling of `undefined` from index signatures — prevents a common class of runtime errors.
