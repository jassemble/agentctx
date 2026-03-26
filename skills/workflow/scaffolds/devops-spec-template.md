---
id: "NNNN"
title: "Feature Title — DevOps"
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
team: devops
parent_spec: "NNNN"
branch: feat/NNNN-feature-name
priority: P2
history:
  - status: draft
    date: YYYY-MM-DD
---

# Feature Title — DevOps

## Infrastructure Changes
<!-- New services, databases, queues, storage buckets -->
| Resource | Type | Environment | Description |
|----------|------|-------------|-------------|
| resource-db | PostgreSQL | staging, production | New database for feature |

## Environment Variables
<!-- New env vars needed, which environments, sensitive or not -->
| Variable | Environments | Sensitive | Description |
|----------|-------------|-----------|-------------|
| RESOURCE_API_KEY | staging, prod | Yes | API key for external service |
| FEATURE_FLAG_ENABLED | all | No | Toggle for gradual rollout |

## CI/CD Pipeline Changes
<!-- New build steps, test stages, deployment configuration -->
- [ ] Add database migration step to deployment pipeline
- [ ] Add integration test stage for new endpoints
- [ ] Configure environment variables in CI secrets
- [ ] Update build configuration if new dependencies added

## Database Migrations
<!-- Migration strategy, zero-downtime requirements -->
- [ ] Migrations are backward-compatible (no column drops without deprecation)
- [ ] Migration can run while old code is still serving traffic
- [ ] Rollback migration is tested and verified

## Monitoring / Alerting
<!-- New metrics, dashboards, alerts -->
| Metric | Alert Threshold | Channel |
|--------|----------------|---------|
| API error rate | > 5% for 5min | PagerDuty |
| Response time p95 | > 500ms for 10min | Slack |
| Database connections | > 80% pool | PagerDuty |

## Security Considerations
<!-- Network policies, secrets management, access control -->
- [ ] Secrets stored in vault / secrets manager (never in code)
- [ ] Network policies restrict access appropriately
- [ ] Service accounts have minimum required permissions

## Rollback Plan
<!-- How to revert this change if something goes wrong -->
1. **Immediate rollback**: Revert deployment to previous version
   ```bash
   # Example rollback command
   kubectl rollout undo deployment/resource-service
   ```
2. **Database rollback**: Run down migration (if safe)
   ```bash
   npm run migrate:down -- --step 1
   ```
3. **Feature flag**: Disable feature via environment variable
4. **Verification**: Confirm rollback restored previous behavior

## Deployment Order
<!-- If multiple services need deploying, specify order -->
1. Run database migrations
2. Deploy backend service
3. Deploy frontend/CDN
4. Enable feature flag (gradual rollout)

## Acceptance Criteria
- [ ] Infrastructure provisioned in staging environment
- [ ] CI/CD pipeline passes with new configuration
- [ ] Environment variables configured in all target environments
- [ ] Monitoring dashboards created and alerts configured
- [ ] Rollback procedure tested in staging
- [ ] Zero-downtime deployment verified
- [ ] Security review passed for infrastructure changes

## Dependencies
<!-- Other team specs that affect deployment -->
<!-- External service dependencies -->

## Notes
<!-- Terraform/IaC file paths, runbooks, escalation procedures -->
