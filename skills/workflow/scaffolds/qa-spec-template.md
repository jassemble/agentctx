---
id: NNNN
title: Feature Title — QA
status: draft
created: YYYY-MM-DD
team: qa
parent_spec: NNNN
branch: feat/NNNN-feature-name
---

# Feature Title — QA

## Test Matrix
| Feature Area | Scenario | Type | Priority |
|-------------|----------|------|----------|
| Resource creation | Happy path — valid input | Integration | P0 |
| Resource creation | Invalid input rejected | Unit | P0 |
| Resource creation | Auth required | Integration | P0 |
| Resource list | Pagination works | Integration | P1 |
| Resource list | Empty state shown | Unit | P2 |

## Test Types Needed
### Unit Tests
<!-- Pure function tests, component rendering, validation logic -->
- [ ] Service logic: business rules, validation
- [ ] Components: render with props, handle events
- [ ] Utilities: formatters, parsers, helpers

### Integration Tests
<!-- API endpoint tests, database interactions, multi-component flows -->
- [ ] API endpoints: request/response cycle, auth, error handling
- [ ] Database: queries return expected data, migrations work
- [ ] State management: actions produce correct state changes

### End-to-End Tests
<!-- Full user flow through the application -->
- [ ] Complete user journey: create, read, update, delete
- [ ] Error recovery: network failure, invalid data, timeout
- [ ] Cross-browser/platform: works on target environments

## Test Data Requirements
<!-- What test data needs to exist, fixtures, factories -->
```typescript
// Example test fixtures
const validResource = {
  name: 'Test Resource',
  // ...
};

const invalidResource = {
  name: '', // empty name should fail validation
};
```

## Edge Cases to Cover
- [ ] Empty inputs / missing required fields
- [ ] Maximum length inputs / boundary values
- [ ] Concurrent requests / race conditions
- [ ] Network failures / timeouts
- [ ] Unauthorized access attempts
- [ ] Malformed request bodies
- [ ] Special characters in inputs (XSS, SQL injection)
- [ ] Pagination boundaries (first page, last page, empty page)

## Performance Criteria
<!-- Response times, throughput, resource limits -->
| Metric | Target | Measurement |
|--------|--------|-------------|
| API response time (p95) | < 200ms | Load test |
| Page load time | < 2s | Lighthouse |
| Database query time | < 50ms | Query profiling |

## Acceptance Criteria
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All e2e tests pass
- [ ] Test coverage meets project threshold
- [ ] Edge cases are covered with explicit test cases
- [ ] Performance criteria are met under expected load
- [ ] No regressions in existing test suite

## Dependencies
<!-- Which team specs define the contracts being tested -->
<!-- Test infrastructure requirements -->

## Notes
<!-- Testing environment setup, CI considerations, flaky test strategies -->
