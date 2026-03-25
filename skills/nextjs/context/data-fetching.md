# Next.js App Router — Data Fetching

## Server Components Are the Default

Every component inside `app/` is a **Server Component** unless you add `'use client'` at the top. Server Components can:

- `await` directly in the component body
- Access databases, file systems, and secrets without exposing them to the client
- Reduce client bundle size by keeping heavy dependencies server-side

**Rule: don't add `'use client'` unless the component needs interactivity** (useState, useEffect, event handlers, browser APIs).

## Fetching Data in Server Components

```typescript
// app/posts/page.tsx — this runs only on the server
export default async function PostsPage() {
  const posts = await db.post.findMany({ orderBy: { createdAt: 'desc' } });
  return <PostList posts={posts} />;
}
```

You can call any async function — database queries, `fetch()`, file reads. No `useEffect`, no loading state management.

### When to use `fetch()` vs direct DB/service calls

- **Direct calls** (Prisma, Drizzle, SDK methods): preferred when the data source is available server-side. Simpler, no serialization overhead.
- **`fetch()` calls**: use when calling external APIs or when you need Next.js fetch caching/revalidation semantics.

```typescript
// fetch with revalidation
const data = await fetch('https://api.example.com/posts', {
  next: { revalidate: 60 },        // ISR: revalidate every 60s
});

// fetch with tags for on-demand revalidation
const data = await fetch('https://api.example.com/posts', {
  next: { tags: ['posts'] },
});
```

## Server Actions

Add `'use server'` at the top of a file (or inline in a function) to create a **Server Action** — a function that runs on the server but can be called from client components.

```typescript
// app/actions/posts.ts
'use server';

import { revalidatePath } from 'next/cache';

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string;
  await db.post.create({ data: { title } });
  revalidatePath('/posts');
}
```

```tsx
// app/posts/new/page.tsx
import { createPost } from '@/app/actions/posts';

export default function NewPost() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <button type="submit">Create</button>
    </form>
  );
}
```

- Server Actions work with progressive enhancement — forms submit even without JS.
- Use `useActionState` (React 19) to track pending/error states in client components.
- Always validate inputs server-side — the action is an HTTP endpoint under the hood.

## Cache Revalidation

| Method | Use case |
|--------|----------|
| `revalidatePath('/posts')` | Purge cache for a specific route |
| `revalidateTag('posts')` | Purge all fetches tagged with `'posts'` |
| `{ next: { revalidate: 60 } }` | Time-based ISR on fetch |
| `export const revalidate = 60` | Segment-level time-based revalidation |

For mutations (create/update/delete), call `revalidatePath` or `revalidateTag` in the Server Action after the write.

## Streaming with Suspense

Wrap slow components in `<Suspense>` to stream the rest of the page immediately:

```tsx
import { Suspense } from 'react';

export default function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<RevenueChartSkeleton />}>
        <RevenueChart />   {/* async server component — streams when ready */}
      </Suspense>
    </div>
  );
}
```

- `loading.tsx` is syntactic sugar for wrapping `page.tsx` in a Suspense boundary.
- Place Suspense boundaries around the **slowest** parts — don't wrap everything.

## Static Generation

```typescript
// app/posts/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await db.post.findMany({ select: { slug: true } });
  return posts.map((post) => ({ slug: post.slug }));
}
```

- Pages with `generateStaticParams` are pre-rendered at build time.
- Combine with `dynamicParams = false` to return 404 for unknown params instead of on-demand rendering.

## Don't

- Don't wrap everything in Suspense — only async components that fetch data need it
- Don't use `useState` + `useEffect` for data fetching — use Server Components or Server Actions
- Don't call `revalidatePath('/')` to revalidate everything — be specific about what to revalidate
- Don't create separate API route handlers just to fetch from a database — Server Components can query directly
- Don't cache user-specific data with `unstable_cache` — it's shared across all users by default
