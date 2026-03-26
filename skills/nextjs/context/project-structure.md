# Next.js App Router — Project Structure

## Quick Rules
- Routes live in `src/app/` — shared components in `src/components/`, utilities in `src/lib/`
- Colocate route-specific components in `_components/` inside the route folder (prefixed `_` = private)
- Push `'use client'` boundaries as deep as possible — client components should be leaf nodes
- Use `server-only` package for code that must never run on the client (DB queries, secrets)
- API route handlers go in `app/api/` as `route.ts` — prefer Server Actions for form submissions
- `NEXT_PUBLIC_*` env vars are bundled into client JS; all others are server-only
- Middleware goes in `middleware.ts` at project root (next to `src/`, not inside it)
- Use `@/` path alias for all absolute imports — never use deep relative paths (`../../../`)

## Patterns

### Canonical Directory Layout

```
├── src/
│   ├── app/                    # App Router root — all routes live here
│   │   ├── layout.tsx          # Root layout (required: wraps entire app)
│   │   ├── page.tsx            # Home page (/)
│   │   ├── globals.css         # Global styles (imported in root layout)
│   │   ├── (auth)/             # Route group for auth pages
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── dashboard/
│   │   │   ├── layout.tsx      # Dashboard-specific layout
│   │   │   ├── page.tsx
│   │   │   └── settings/page.tsx
│   │   └── api/                # Route handlers (API endpoints)
│   │       └── webhooks/
│   │           └── route.ts
│   ├── components/             # Shared React components
│   │   ├── ui/                 # Primitives (button, input, card)
│   │   └── layout/             # Shell components (header, sidebar)
│   ├── lib/                    # Shared utilities and business logic
│   │   ├── db.ts               # Database client singleton
│   │   ├── auth.ts             # Auth helpers
│   │   └── utils.ts            # Pure utility functions
│   ├── types/                  # Shared TypeScript types
│   └── hooks/                  # Client-side React hooks
├── public/                     # Static assets (served at /)
├── next.config.js              # Next.js configuration
├── middleware.ts               # Edge middleware (at project root, NOT in src/)
└── .env.local                  # Local environment variables (gitignored)
```

### Components

- **`src/components/`** — shared components used by multiple routes.
- **Colocate** route-specific components inside the route folder (e.g., `app/dashboard/_components/chart.tsx`). Prefix with `_` to mark as private — `_components` won't become routes.
- Components that use `'use client'` should be leaf nodes — push client boundaries as deep as possible.

### Server-Only Code

Utility functions that must **never** run on the client (DB queries, secret access): use the `server-only` package.

```typescript
// src/lib/db.ts
import 'server-only';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const db = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
```

### API Route Handlers

- Place in `app/api/` using `route.ts` files.
- Export named functions matching HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
- Use route handlers for **webhooks**, **third-party callbacks**, and **client-side mutations that can't use Server Actions**.
- Prefer Server Actions over route handlers for form submissions.

```typescript
// app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.text();
  // verify webhook signature, process event
  return NextResponse.json({ received: true });
}
```

### Environment Variables

| Pattern | Behavior |
|---------|----------|
| `NEXT_PUBLIC_*` | Bundled into client JS — visible to browsers |
| All others | Server-only — available in Server Components, Route Handlers, middleware |

- Use `.env.local` for local development (gitignored by default).
- Access with `process.env.VARIABLE_NAME` — they are NOT available in `'use client'` files unless prefixed with `NEXT_PUBLIC_`.

### next.config.js Key Settings

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.example.com' },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
    typedRoutes: true,                      // type-safe Link hrefs
  },
  redirects: async () => [
    { source: '/old-path', destination: '/new-path', permanent: true },
  ],
};

module.exports = nextConfig;
```

- `images.remotePatterns` — required for `<Image>` to optimize external images.
- `typedRoutes` — enables compile-time checking of `<Link href>` values.
- Always configure `redirects` for moved pages rather than handling in middleware.

## Don't

- Don't put shared components in `src/app/` — use `src/components/` or `src/lib/`
- Don't create barrel files (`index.ts`) that re-export everything — it breaks tree shaking
- Don't store environment variables without the `NEXT_PUBLIC_` prefix if needed client-side
- Don't import server-only code in client components — use `server-only` package to catch mistakes
- Don't put business logic in route handlers — extract to service functions in `src/lib/`
