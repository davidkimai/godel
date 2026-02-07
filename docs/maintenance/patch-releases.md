# Godel Patch Release Process

**Version:** 1.0  
**Last Updated:** 2026-02-06  
**Frequency:** As needed (typically weekly)  
**Scope:** Bug fixes and security patches only

---

## Overview

This document defines the standardized process for creating and deploying patch releases (e.g., v2.0.1, v2.0.2) for critical bug fixes and security updates between minor releases.

---

## Patch Release Criteria

### Eligible Changes

| Type | Examples | Eligibility |
|------|----------|-------------|
| Security Fix | CVE patches, auth bypass fixes | ✅ Always |
| Data Loss | Corruption, deletion bugs | ✅ Always |
| Crash | Server crashes, core dumps | ✅ Always |
| Regression | Feature worked in previous version | ✅ Always |
| Performance | Severe degradation | ✅ Case by case |
| Minor Bug | Non-critical fixes | ❌ Next minor release |
| Feature | New functionality | ❌ Next minor release |
| Refactor | Code cleanup | ❌ Next minor release |

### Patch Release Triggers

**Immediate (within 24h):**
- Critical security vulnerability (CVSS 9.0+)
- Data loss or corruption
- Complete service outage

**Scheduled (weekly):**
- Security fixes (CVSS < 9.0)
- Critical bug fixes
- Performance regressions

**Batch (bi-weekly):**
- Multiple related fixes
- Low-risk improvements

---

## Release Process

### Phase 1: Preparation (Day 1)

#### 1.1 Issue Selection

**Cherry-Pick Candidates:**
```bash
# List commits on main since last release
git log v2.0.0..main --oneline

# Identify fixes to cherry-pick
# Must be:
# - Already merged to main
# - Reviewed and tested
# - No breaking changes
```

**Selection Criteria:**
- [ ] Fixes critical issue (P0 or P1)
- [ ] Has test coverage
- [ ] No merge conflicts expected
- [ ] Risk assessment complete

#### 1.2 Create Release Branch

```bash
# From the current stable branch
git checkout -b release/v2.0.1 v2.0.0

# Cherry-pick each fix
git cherry-pick <commit-hash-1>
git cherry-pick <commit-hash-2>

# Resolve any conflicts
# Re-run tests after each pick
```

#### 1.3 Version Bump

```bash
# Update version in package.json
npm version patch --no-git-tag-version

# Update version in other files
# - src/version.ts
# - helm/Chart.yaml
# - docker-compose.yml

# Commit version bump
git add .
git commit -m "chore: bump version to 2.0.1"
```

### Phase 2: Testing (Day 1-2)

#### 2.1 Automated Tests

```bash
# Run full test suite
npm run test:all

# Run integration tests
npm run test:integration

# Run security scans
npm audit
snyk test
```

#### 2.2 Manual Verification

**Release Checklist:**
- [ ] Smoke tests passing
- [ ] Critical paths verified
- [ ] Security fix validated
- [ ] Performance benchmarks acceptable
- [ ] Migration scripts tested (if applicable)

#### 2.3 Staging Deployment

```bash
# Deploy to staging environment
./scripts/deploy-staging.sh v2.0.1

# Run staging validation
./scripts/smoke-tests.sh staging

# Monitor for 2 hours minimum
```

### Phase 3: Release Preparation (Day 2)

#### 3.1 Release Notes

**Template:**
```markdown
# Godel v2.0.1 Release Notes

**Release Date:** YYYY-MM-DD
**Previous Version:** v2.0.0

## Security Fixes
- [CVE-YYYY-XXXXX] Fixed authentication bypass in API gateway

## Bug Fixes
- Fixed memory leak in task engine (#1234)
- Resolved race condition in state store (#1235)
- Corrected validation error in intent parser (#1236)

## Performance
- Improved query performance for large task lists

## Known Issues
- None

## Upgrade Notes
No special upgrade steps required.
```

#### 3.2 Tag and Build

```bash
# Create signed tag
git tag -s v2.0.1 -m "Release v2.0.1"

# Push tag
git push origin v2.0.1

# Build release artifacts
./scripts/build-release.sh v2.0.1

# Artifacts produced:
# - Docker images
# - npm packages
# - CLI binaries
# - Helm charts
```

### Phase 4: Deployment (Day 3)

#### 4.1 Pre-Deployment

**Announcements:**
- [ ] Post to #announcements (Discord)
- [ ] Update status page
- [ ] Notify enterprise customers (24h advance)

**Rollback Plan:**
- [ ] Verify rollback images available
- [ ] Test rollback procedure in staging
- [ ] On-call engineer briefed

#### 4.2 Canary Deployment

```bash
# Deploy to 5% of production traffic
kubectl set image deployment/godel-api \
  godel-api=godel/api:v2.0.1 \
  --namespace=production

# Monitor for 30 minutes
./scripts/monitor-canary.sh v2.0.1

# Metrics to watch:
# - Error rate
# - Latency P99
# - CPU/Memory usage
# - Custom business metrics
```

#### 4.3 Full Rollout

```bash
# If canary is healthy, proceed to 25%
kubectl set image deployment/godel-api \
  godel-api=godel/api:v2.0.1 \
  --namespace=production

# Monitor for 30 minutes

# If still healthy, 100% rollout
kubectl set image deployment/godel-api \
  godel-api=godel/api:v2.0.1 \
  --namespace=production
```

### Phase 5: Post-Release (Day 3-4)

#### 5.1 Verification

**Checklist:**
- [ ] All pods running new version
- [ ] Health checks passing
- [ ] No increase in error rates
- [ ] No customer complaints
- [ ] Performance metrics stable

#### 5.2 Communication

**Channels:**
- [ ] GitHub release published
- [ ] Forum announcement
- [ ] Tweet from @godel_platform
- [ ] Newsletter mention
- [ ] Documentation updated

#### 5.3 Monitoring

**Watch Period:** 48 hours

**Check Every 2 Hours:**
- Error rates
- Performance metrics
- Customer support tickets
- Community feedback

---

## Security Release Process

### Embargo Period

**For Critical CVEs:**
1. Private security fix branch
2. Coordinated disclosure date
3. Pre-notify affected users
4. Release on agreed date/time

### Security Release Checklist

- [ ] CVE registered (if applicable)
- [ ] Fix reviewed by security team
- [ ] Advisory drafted
- [ ] Affected versions documented
- [ ] Mitigations documented
- [ ] CVSS score calculated

### Security Advisory Template

```markdown
# Security Advisory: GSA-2026-001

**Severity:** Critical (CVSS 9.8)
**Affected Versions:** v2.0.0, v1.9.x
**Fixed Version:** v2.0.1
**CVE ID:** CVE-2026-XXXXX

## Summary
Brief description of vulnerability

## Impact
What could an attacker do?

## Mitigation
Steps to protect before upgrading

## Patch
How to upgrade

## Credits
Who discovered and reported
```

---

## Rollback Procedures

### Automatic Rollback Triggers

```yaml
# prometheus alert
- alert: PatchReleaseRollbackTrigger
  expr: |
    (
      rate(http_requests_total{status=~"5.."}[5m]) > 0.05
      or
      histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 2
    )
    and
    deployment_version == "v2.0.1"
  for: 5m
  labels:
    severity: critical
    action: rollback
```

### Manual Rollback

```bash
# Emergency rollback script
./scripts/emergency-rollback.sh production v2.0.0

# Steps:
# 1. Set image to previous version
# 2. Verify health
# 3. Notify team
# 4. Create incident report
```

---

## Version Numbering

### Semantic Versioning

```
v{MAJOR}.{MINOR}.{PATCH}

MAJOR - Breaking changes
MINOR - New features (backward compatible)
PATCH - Bug fixes only
```

### Pre-release Versions

```
v2.0.1-alpha.1  - Internal testing
v2.0.1-beta.1   - External testing
v2.0.1-rc.1     - Release candidate
v2.0.1          - Stable release
```

---

## Release Schedule

### Regular Cadence

| Release Type | Frequency | Day |
|--------------|-----------|-----|
| Patch | Weekly | Wednesday |
| Minor | Monthly | First Tuesday |
| Major | Quarterly | Planned |

### Emergency Releases

**Can occur any day if:**
- Critical security fix
- Data loss bug
- Service outage

---

## Metrics & Improvement

### Release Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to Patch | < 3 days | Issue reported to release |
| Deployment Time | < 30 min | Tag to production |
| Rollback Rate | < 2% | Patches rolled back |
| Success Rate | > 98% | Smooth deployments |

### Post-Release Review

**Questions:**
1. Did we catch this issue in testing?
2. Could we have prevented it?
3. How was the rollout process?
4. What can we improve?

---

## Related Documents

- [Launch Day Plan](../launch/launch-plan.md)
- [Incident Response](./incident-response.md)
- [On-Call Guide](../launch/on-call.md)
- [Issue Triage Process](./triage-process.md)
