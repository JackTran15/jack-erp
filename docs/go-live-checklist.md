# Go-Live Checklist

## Pre-Deployment Checks

### Infrastructure Readiness

- [ ] PostgreSQL instance provisioned and accessible
- [ ] Database migrations applied successfully (`pnpm --filter @erp/api migration:run`)
- [ ] Migration rollback tested (`pnpm --filter @erp/api migration:revert`)
- [ ] Redis instance accessible from API pods
- [ ] Redis connectivity verified (`redis-cli ping` returns `PONG`)
- [ ] Redpanda cluster healthy — all brokers responding
- [ ] Redpanda topics created for all event domains (inventory, pos, accounting, audit)
- [ ] Dead-letter queue (DLQ) topics provisioned
- [ ] WebSocket connectivity verified through load balancer

### Test Suite

- [ ] All unit tests pass (`pnpm -r test`)
- [ ] All E2E tests pass (`pnpm --filter @erp/api test:e2e`)
- [ ] Contract drift check passes (`npx ts-node scripts/contract-check.ts`)
- [ ] No critical or high-severity lint warnings

### Configuration

- [ ] Environment variables set for production (DB, Redis, JWT secrets, Redpanda brokers)
- [ ] JWT secrets rotated from development/staging values
- [ ] CORS origins restricted to production domains
- [ ] `NODE_ENV=production`
- [ ] `synchronize: false` confirmed in TypeORM config (no auto-schema changes)

### Security

- [ ] Access review: all user roles and permissions verified
- [ ] Admin accounts use strong passwords
- [ ] API rate limiting configured
- [ ] Dependency vulnerability scan clean (`pnpm audit`)

---

## Deployment Steps

### 1. Build

```bash
pnpm install --frozen-lockfile
pnpm -r build
```

### 2. Database Migration

```bash
pnpm --filter @erp/api migration:run
```

### 3. Deploy API

- Deploy the containerized NestJS API to production cluster
- Verify health endpoint responds: `GET /health → 200`

### 4. Deploy Frontends

- Deploy `backoffice-web` static assets to CDN/web server
- Deploy `pos-web` static assets to CDN/web server
- Verify both apps load and can reach the API

### 5. Verify Services

- [ ] API health check: `curl https://api.example.com/health`
- [ ] WebSocket connection test from browser console
- [ ] Redis connectivity: session creation works via login
- [ ] Redpanda: publish a test event and verify consumer receives it

---

## Post-Deployment Verification

### Smoke Tests (execute within 30 minutes of deployment)

- [ ] Login with admin credentials → receives valid JWT
- [ ] Create a customer → 201 response
- [ ] Create an inventory item → 201 response
- [ ] Open a POS session → session ID returned
- [ ] Perform a checkout → sale created, stock decremented, journal posted
- [ ] Process a return → reversal entries created
- [ ] Post a journal entry → balanced entry persisted
- [ ] Run dashboard report → data returned
- [ ] Verify WebSocket notification received on checkout event

### Data Integrity Checks

- [ ] Stock ledger balances reconcile with balance snapshots
- [ ] Journal entries are balanced (total debits = total credits)
- [ ] No orphaned sessions in OPEN state from prior environment
- [ ] Audit log entries are being written for all mutations

### Monitoring Confirmation

- [ ] APM / metrics agent reporting data
- [ ] Error tracking service receiving events
- [ ] Log aggregation pipeline active
- [ ] Alerting rules configured for P1 scenarios:
  - API error rate > 5%
  - Database connection pool exhaustion
  - Redis connection failure
  - Checkout endpoint latency > 2s

---

## Rollback Procedure

### Decision Criteria

Initiate rollback if any of the following occur within 2 hours of deployment:

- Checkout flow is broken (P1)
- Data integrity issue detected (unbalanced journals, stock mismatch)
- Authentication/authorization failures for legitimate users
- Database migration caused data corruption

### Rollback Steps

1. **Switch traffic** back to previous deployment version
2. **Revert database migration** (if migration was applied):
   ```bash
   pnpm --filter @erp/api migration:revert
   ```
3. **Clear Redis sessions** (force re-login after rollback):
   ```bash
   redis-cli FLUSHDB
   ```
4. **Verify** previous version is serving correctly
5. **Notify stakeholders** of rollback and estimated timeline for fix

### Post-Rollback

- [ ] Capture logs and metrics from the failed deployment window
- [ ] Create incident report
- [ ] Root cause analysis within 24 hours
- [ ] Fix verified in staging before next production attempt

---

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Engineering Lead | | | ☐ Approved |
| QA Lead | | | ☐ Approved |
| Operations | | | ☐ Approved |
| Business Owner | | | ☐ Approved |
