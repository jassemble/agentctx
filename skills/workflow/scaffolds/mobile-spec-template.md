---
id: NNNN
title: Feature Title — Mobile
status: draft
created: YYYY-MM-DD
team: mobile
parent_spec: NNNN
branch: feat/NNNN-feature-name
---

# Feature Title — Mobile

## Screens / Navigation
| Screen | Component | Navigation | Auth Required |
|--------|-----------|------------|---------------|
| CreateResource | CreateResourceScreen | Stack push from ResourceList | Yes |

## Native Components
### ScreenName
**Props:**
```typescript
interface ScreenNameProps {
  route: { params: { id: string } };
  navigation: NavigationProp;
}
```
**Behavior:**
<!-- What it renders, gestures, animations -->

## Platform-Specific Behavior
### iOS
<!-- iOS-specific UI patterns, haptics, system integration -->

### Android
<!-- Android-specific patterns, back button handling, material design -->

## State Management
<!-- Local state, global store, persisted state -->
```typescript
interface FeatureState {
  items: Resource[];
  loading: boolean;
  error: string | null;
}
```

## API Integration
<!-- Which backend endpoints are consumed -->
<!-- How data is fetched, cached, and synced -->
| Endpoint | Hook/Function | Offline Strategy |
|----------|--------------|------------------|
| GET /api/v1/resource | useResources() | Cache-first |

## Offline Support
<!-- What works offline, sync strategy, conflict resolution -->
- [ ] Data is cached locally for offline access
- [ ] Queue writes when offline, sync when back online
- [ ] Handle conflict resolution on sync

## Push Notifications
<!-- If applicable: notification types, deep links, handling -->

## User Flows
1. User taps "Create" button on resource list
2. Form screen slides in (stack navigation)
3. User fills form with native input components
4. Submit: loading indicator, haptic feedback on success
5. Success: pop to resource list, item appears
6. Error: inline alert with retry option

## Acceptance Criteria
- [ ] Screens render correctly on iOS and Android
- [ ] Navigation gestures work (swipe back on iOS, back button on Android)
- [ ] Forms use native keyboard types and autocomplete
- [ ] Loading and error states are handled
- [ ] Offline mode degrades gracefully
- [ ] App handles backgrounding and foregrounding
- [ ] API integration matches backend contracts
- [ ] Tests cover screen rendering and key interactions

## Dependencies
<!-- Backend spec for API contracts -->
<!-- Shared types/interfaces -->

## Notes
<!-- Minimum OS versions, device targets, performance budgets -->
