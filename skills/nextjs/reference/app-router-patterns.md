# App Router Quick Reference

## Route Segment Config Options
```typescript
// In any page.tsx or layout.tsx
export const dynamic = 'auto' | 'force-dynamic' | 'error' | 'force-static'
export const revalidate = false | 0 | number
export const fetchCache = 'auto' | 'default-cache' | 'only-cache' | 'force-cache' | 'force-no-store' | 'default-no-store' | 'only-no-store'
export const runtime = 'nodejs' | 'edge'
```

## Common Patterns
```tsx
// Parallel route with fallback
// app/@modal/default.tsx — return null for no-match
export default function Default() { return null }

// Intercepting route
// app/@modal/(.)photo/[id]/page.tsx — intercepts /photo/[id]

// Route group for layout variants
// app/(marketing)/about/page.tsx — marketing layout
// app/(app)/dashboard/page.tsx — app layout
```

## Server Action Patterns
```tsx
'use server'

// With form validation
async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  if (!title) return { error: 'Title required' }
  // ... create post
  revalidatePath('/posts')
  redirect('/posts')
}

// With useActionState (React 19)
const [state, action, pending] = useActionState(createPost, null)
```
