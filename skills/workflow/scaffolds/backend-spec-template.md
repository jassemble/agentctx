---
id: NNNN
title: Feature Title — Backend
status: draft
created: YYYY-MM-DD
team: backend
parent_spec: NNNN
branch: feat/NNNN-feature-name
---

# Feature Title — Backend

## API Endpoints
| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | /api/v1/resource | Create resource | Yes |

## Request/Response Contracts
### POST /api/v1/resource
**Request:**
```typescript
interface CreateResourceRequest {
  name: string;
  // ...
}
```

**Response (201):**
```typescript
interface ResourceResponse {
  id: string;
  name: string;
  createdAt: string;
}
```

**Error (4xx/5xx):**
```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

## Database Changes
<!-- Schema migrations, new tables/columns, indexes -->
<!-- Include both up and down migrations -->

## Service Logic
<!-- Business rules, validation, error handling -->
<!-- Key algorithms, data transformations -->

## Middleware
<!-- Auth checks, rate limiting, request validation -->

## Acceptance Criteria
- [ ] Endpoint returns correct status codes (200, 201, 400, 401, 404, 500)
- [ ] Input validation rejects malformed data with descriptive errors
- [ ] Auth middleware protects endpoints that require authentication
- [ ] Database migrations are reversible (up + down)
- [ ] Service logic handles edge cases gracefully
- [ ] Tests cover happy path and error cases
- [ ] API responses match the defined contracts exactly

## Dependencies
<!-- Other team specs this depends on -->
<!-- External services, third-party APIs -->

## Notes
<!-- Implementation hints, performance considerations -->
