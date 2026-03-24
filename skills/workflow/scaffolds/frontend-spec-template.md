---
id: NNNN
title: Feature Title — Frontend
status: draft
created: YYYY-MM-DD
team: frontend
parent_spec: NNNN
branch: feat/NNNN-feature-name
---

# Feature Title — Frontend

## Pages / Routes
| Route | Page Component | Description | Auth Required |
|-------|---------------|-------------|---------------|
| /resource/new | CreateResourcePage | Form to create a resource | Yes |

## Components
### ComponentName
**Props:**
```typescript
interface ComponentNameProps {
  title: string;
  onSubmit: (data: FormData) => void;
  // ...
}
```
**Behavior:**
<!-- What it renders, user interactions, state changes -->

## State Management
<!-- Store/context shape, actions, reducers -->
<!-- Where state lives: local, global, URL params -->
```typescript
interface FeatureState {
  items: Resource[];
  loading: boolean;
  error: string | null;
}
```

## API Integration
<!-- Which backend endpoints are consumed -->
<!-- How data is fetched, cached, and invalidated -->
| Endpoint | Hook/Function | Caching Strategy |
|----------|--------------|------------------|
| GET /api/v1/resource | useResources() | SWR / 30s stale |

## User Flows
1. User navigates to /resource/new
2. Form is displayed with validation
3. User submits — loading state shown
4. Success: redirect to /resource/{id}
5. Error: inline error message displayed

## Acceptance Criteria
- [ ] All pages render without errors
- [ ] Forms validate input before submission
- [ ] Loading states are shown during async operations
- [ ] Error states are displayed clearly to the user
- [ ] Navigation between pages works correctly
- [ ] Responsive layout works on mobile (320px) through desktop (1440px)
- [ ] Keyboard navigation and screen reader support (WCAG 2.1 AA)
- [ ] API integration matches backend contracts

## Dependencies
<!-- Backend spec for API contracts -->
<!-- Design system / component library -->

## Notes
<!-- Browser support requirements, performance budgets -->
