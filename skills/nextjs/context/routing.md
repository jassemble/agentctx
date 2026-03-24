# Next.js App Router — Routing

## File Conventions

Every route segment maps to a folder inside `src/app/`. Special files inside a segment:

| File | Purpose | When to use |
|------|---------|-------------|
| `page.tsx` | The UI for a route — **required** to make a segment publicly accessible | Every route that should render |
| `layout.tsx` | Shared wrapper that **persists across navigations** (does NOT re-render) | Nav shells, sidebars, providers |
| `loading.tsx` | Instant loading UI shown while `page.tsx` streams in via Suspense | Any page with async data |
| `error.tsx` | Error boundary scoped to the segment (must be `'use client'`) | Isolate failures per-section |
| `not-found.tsx` | UI for `notFound()` calls or unmatched child routes | Custom 404 per segment |
| `template.tsx` | Like layout but **re-mounts** on every navigation | Animations, per-page transitions |
| `default.tsx` | Fallback for parallel routes when no matching segment exists | Required with `@slot` parallel routes |

## Dynamic Routes

```
app/posts/[slug]/page.tsx        → /posts/hello-world  (single param)
app/docs/[...slug]/page.tsx      → /docs/a/b/c         (catch-all, array)
app/shop/[[...slug]]/page.tsx    → /shop OR /shop/a/b   (optional catch-all)
```

- Access params via the `params` prop — it's a **Promise** in Next.js 15+: `const { slug } = await params`.
- Use `generateStaticParams()` to pre-render known dynamic routes at build time.

## Route Groups

Wrap a folder name in parentheses to **group routes without affecting the URL**:

```
app/(marketing)/about/page.tsx   → /about
app/(dashboard)/settings/page.tsx → /settings
```

Each group can have its own `layout.tsx` — use this to apply different layouts to different sections (e.g., public pages vs authenticated dashboard) without nesting URLs.

## Parallel Routes

Prefix a folder with `@` to create a named slot rendered in the **same layout**:

```
app/@modal/login/page.tsx
app/@sidebar/page.tsx
app/layout.tsx                   → receives { children, modal, sidebar } as props
```

- Every `@slot` needs a `default.tsx` for when no matching route exists.
- Parallel routes enable **independent loading/error states** per slot.
- Common use: modals that have their own URL but render over the parent page.

## Intercepting Routes

Use `(.)`, `(..)`, `(...)` prefixes to intercept a route and render alternative UI:

```
app/feed/@modal/(.)photo/[id]/page.tsx
```

- `(.)` — intercepts same level
- `(..)` — intercepts one level up
- `(...)` — intercepts from root

Primary use case: clicking a photo in a feed opens a modal (intercepted), but navigating directly to `/photo/123` renders the full page.

## Middleware

Place `middleware.ts` at the **project root** (next to `src/`, not inside it). It runs on the Edge runtime before every matched request.

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Redirect, rewrite, or add headers
  if (!request.cookies.get('session')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
```

- Use `matcher` to limit which routes trigger middleware — never run on static assets.
- Middleware cannot read/write to a database directly — use it for auth checks, redirects, headers, and geolocation.
- Keep it lightweight: it runs on every matched request.
