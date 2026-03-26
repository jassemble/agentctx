# TypeScript — Project Conventions

## Quick Rules
- Always enable `strict: true` and `noUncheckedIndexedAccess: true` in tsconfig
- Use kebab-case for files/directories, PascalCase for React component files, `.test.ts` co-located for tests
- Import order: Node builtins > external packages > `@/` absolute imports > relative imports (separated by blank lines)
- Use `import type` and `export type` for types with no runtime representation
- Use `@/` path alias for absolute imports — never go up more than one level with relative paths
- Prefer string union types over enums — zero runtime cost, works with JSON naturally
- Only barrel-export (`index.ts`) leaf modules with no heavy side effects — avoid for large modules
- Use `.tsx` only for files containing JSX; pure logic files use `.ts`

## Patterns

### Strict TSConfig

Always enable strict mode and additional safety checks:

```jsonc
{
  "compilerOptions": {
    "strict": true,                        // enables all strict checks
    "noUncheckedIndexedAccess": true,       // obj[key] returns T | undefined
    "noImplicitOverride": true,             // require 'override' keyword
    "exactOptionalPropertyTypes": true,     // undefined !== missing
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,                // required for bundlers/SWC
    "moduleResolution": "bundler",          // for modern bundlers
    "paths": {
      "@/*": ["./src/*"]                    // path aliases
    }
  }
}
```

`noUncheckedIndexedAccess` is the single most impactful non-default flag — it catches a class of runtime errors that `strict` alone misses.

### File Naming

| Entity | Convention | Example |
|--------|-----------|---------|
| Files and directories | kebab-case | `user-profile.ts`, `api-client/` |
| React components | PascalCase filename | `UserProfile.tsx` |
| Test files | Co-located, `.test.ts` | `user-profile.test.ts` |
| Type-only files | `.types.ts` suffix | `api.types.ts` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |

Use `.tsx` only for files that contain JSX. Pure logic files should use `.ts` even if they're in a React project.

### Import Ordering

Organize imports in this order, separated by blank lines:

```typescript
// 1. Node builtins
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// 2. External packages
import { z } from 'zod';
import { eq } from 'drizzle-orm';

// 3. Internal absolute imports (path aliases)
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';

// 4. Relative imports
import { validateInput } from './validation';
import type { UserFormProps } from './types';
```

Use ESLint with `eslint-plugin-import` or `@trivago/prettier-plugin-sort-imports` to enforce this automatically.

### Barrel Exports

Use barrel files (`index.ts`) **sparingly**. They can prevent tree shaking and create circular dependency issues.

```typescript
// OK — re-exporting a small, cohesive module (e.g., UI components)
// src/components/ui/index.ts
export { Button } from './button';
export { Input } from './input';
export { Card } from './card';

// Bad — barrel for a large module with heavy dependencies
// src/lib/index.ts — pulls in DB client, auth, email, etc.
export * from './db';
export * from './auth';
export * from './email';
```

**Rule**: only barrel-export leaf modules with no heavy side effects. For libraries and utils with significant dependencies, import directly from the specific file.

### Type-Only Exports and Imports

Use `export type` and `import type` for types that have no runtime representation:

```typescript
// Exporting
export type { User, UserRole } from './types';
export { UserSchema } from './schemas';  // runtime value

// Importing
import type { User } from '@/types';
import { UserSchema } from '@/schemas';
```

This ensures bundlers can safely strip type imports and avoids pulling in modules that only contribute types.

### Path Aliases

Configure in both `tsconfig.json` and your bundler:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Use `@/` for all absolute imports within the project. Never use deep relative paths like `../../../lib/utils` — if you're going up more than one level, use the alias.

### Enums vs Union Types

Prefer **string union types** over enums for most cases:

```typescript
// Prefer — zero runtime cost, works with JSON naturally
type Role = 'admin' | 'editor' | 'viewer';

// Use const enum only if you need reverse mapping or iteration
const roles = ['admin', 'editor', 'viewer'] as const;
type Role = typeof roles[number];  // same union, plus iterable array
```

Numeric enums are almost never needed. If you need numeric codes, use a `Record<string, number>` with `as const`.

## Don't

- Don't disable strict mode or `noUncheckedIndexedAccess` — fix the type errors instead
- Don't use `require()` in ES module projects — use `import`
- Don't create utility files with unrelated functions (`utils.ts` with 50 exports) — split by domain
- Don't use default exports for non-component files — named exports are easier to refactor
- Don't put types in a global `types.ts` — colocate types with the code that uses them
