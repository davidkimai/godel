# Godel Issue Triage Process

**Version:** 1.0  
**Last Updated:** 2026-02-06  
**SLA Target:** Initial response within 24 hours

---

## Overview

This document defines the issue triage workflow for the Godel project, ensuring efficient handling of bug reports, feature requests, and support inquiries.

---

## Issue Sources

### Primary Channels

| Source | URL | Triage Owner | Response SLA |
|--------|-----|--------------|--------------|
| GitHub Issues | github.com/godel/issues | Core Team | 24h |
| Discord #bugs | discord.gg/godel | Community Managers | 4h |
| Forum | community.godel.dev | Community Team | 24h |
| Email | support@godel.dev | Support Team | 4h (business) |
| In-App | /feedback | Product Team | 48h |

### Escalation Path

```
Community Manager → Support Engineer → Core Developer → Tech Lead → Engineering Manager
```

---

## Triage Workflow

### Step 1: Initial Receipt (T+0)

**Actions:**
- [ ] Acknowledge receipt (auto-reply)
- [ ] Add to triage queue
- [ ] Assign temporary ID

**Auto-Response Template:**
```
Thanks for reporting! We've received your issue and will triage it within 24 hours.

Reference: GDL-[XXXX]
Status: Pending Triage

For urgent issues, please email support@godel.dev with "URGENT" in the subject.
```

### Step 2: Triage Assessment (T+4h to T+24h)

**Triage Checklist:**
- [ ] Read and understand the issue
- [ ] Check for duplicates
- [ ] Verify reproduction steps
- [ ] Categorize by type and severity
- [ ] Add appropriate labels
- [ ] Assign to component owner
- [ ] Set priority and milestone

**Classification Matrix:**

| Type | Description | Labels |
|------|-------------|--------|
| Bug | Unexpected behavior | `type:bug` |
| Feature Request | New capability | `type:enhancement` |
| Documentation | Docs issue | `type:documentation` |
| Question | Support inquiry | `type:question` |
| Performance | Speed/resource issue | `type:performance` |
| Security | Security concern | `type:security` |

### Step 3: Prioritization

**Priority Levels:**

| Priority | Criteria | Response | Resolution Target |
|----------|----------|----------|-------------------|
| P0 - Critical | Data loss, security breach, outage | Immediate | 24 hours |
| P1 - High | Major feature broken, significant impact | 4 hours | 1 week |
| P2 - Medium | Feature partially broken, workaround exists | 24 hours | 1 month |
| P3 - Low | Minor issue, cosmetic | 1 week | Next release |
| P4 - Triage | Needs investigation | 24 hours | TBD |

**Severity Assessment:**

```
Impact × Urgency = Priority

Impact:
- High: Affects all users or core functionality
- Medium: Affects subset or non-core features  
- Low: Minor inconvenience

Urgency:
- Critical: Blocking production use
- High: Significantly degraded experience
- Medium: Workaround available
- Low: No immediate impact
```

### Step 4: Assignment

**Component Owners:**

| Component | Primary Owner | Backup | GitHub Team |
|-----------|---------------|--------|-------------|
| API Gateway | @api-team-lead | @api-dev-2 | @godel/api |
| Task Engine | @task-team-lead | @task-dev-2 | @godel/tasks |
| Intent Parser | @intent-team-lead | @intent-dev-2 | @godel/intent |
| Runtime Manager | @runtime-team-lead | @runtime-dev-2 | @godel/runtime |
| Federation | @fed-team-lead | @fed-dev-2 | @godel/federation |
| CLI | @cli-team-lead | @cli-dev-2 | @godel/cli |
| Documentation | @docs-lead | @docs-dev | @godel/docs |

### Step 5: Communication

**Status Updates:**

| Status | Description | Visibility |
|--------|-------------|------------|
| `triage` | Awaiting initial assessment | Public |
| `confirmed` | Issue reproduced and valid | Public |
| `in-progress` | Developer assigned and working | Public |
| `needs-info` | Awaiting reporter input | Public |
| `blocked` | External dependency blocking | Public |
| `pr-ready` | Fix implemented, in review | Public |
| `resolved` | Fix merged/implemented | Public |
| `closed` | Issue complete | Public |
| `wontfix` | Won't be addressed | Public + Reason |
| `duplicate` | Duplicate of existing issue | Public + Link |

**Communication Templates:**

**Needs Info:**
```
Thanks for reporting! To help us investigate, could you please provide:

1. [Specific missing information]
2. [Logs or error messages]
3. [Environment details]

We'll resume triage once we have this information.
```

**Confirmed Bug:**
```
✅ Confirmed: [Brief description]

We've reproduced this issue and are tracking it internally.

Priority: [P0/P1/P2/P3]
Component: [Component]
Assigned: [@developer]
Target: [Milestone/Release]

We'll update this thread as we make progress.
```

**Feature Request:**
```
Thanks for the feature request! We've added this to our backlog.

Current status: Under consideration
Community interest: [+1s count]

We'll consider this for [roadmap timeframe] planning. For now, 
[workaround if available].
```

---

## Label System

### Type Labels

```
type:bug           - Something isn't working
type:enhancement   - New feature or request
type:documentation - Documentation improvement
type:question      - Question or support
type:performance   - Performance concern
type:security      - Security issue
```

### Priority Labels

```
priority:P0 - Critical
priority:P1 - High
priority:P2 - Medium
priority:P3 - Low
```

### Component Labels

```
component:api
component:tasks
component:intent
component:runtime
component:federation
component:cli
component:docs
component:monitoring
```

### Status Labels

```
status:triage
status:confirmed
status:in-progress
status:needs-info
status:blocked
status:pr-ready
```

### Special Labels

```
good-first-issue    - Good for new contributors
help-wanted         - Community help needed
breaking-change     - Will break compatibility
needs-design        - Needs design input
needs-rfc           - Needs RFC before implementation
```

---

## SLA Commitments

### Response Times

| Priority | Initial Response | Status Update | Resolution |
|----------|-----------------|---------------|------------|
| P0 | 1 hour | Every 2 hours | 24 hours |
| P1 | 4 hours | Daily | 1 week |
| P2 | 24 hours | Weekly | 1 month |
| P3 | 1 week | Per release | Next release |

### Business Hours

**Standard:** Monday-Friday, 9 AM - 6 PM local time (rotating coverage)

**P0 Exception:** 24/7 coverage via on-call rotation

### Holiday Coverage

- P0: Full coverage
- P1/P2: Best effort
- P3: Next business day

---

## Metrics & KPIs

### Triage Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Triage Time | < 24h | Time to first label |
| Response Time | Per SLA | Time to first human response |
| Resolution Time | Per priority | Time to close |
| Reopen Rate | < 5% | Issues reopened |
| Satisfaction | > 4.0/5 | Post-resolution survey |

### Weekly Reports

**Distributed to:** Engineering leads, Product, Support

**Content:**
- New issues by priority
- Closed issues by component
- Average resolution time
- SLA compliance rate
- Trending issues

### Monthly Review

**Participants:** Triage team leads

**Agenda:**
- SLA performance review
- Process improvements
- Training needs
- Tooling updates

---

## Tools & Automation

### GitHub Actions

**Auto-Labeler:**
```yaml
# .github/workflows/triage.yml
name: Auto Triage
on:
  issues:
    types: [opened]
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/labeler@v4
        with:
          configuration-path: .github/labeler.yml
```

**Stale Issue Handler:**
```yaml
# Mark issues as stale after 30 days
# Close stale issues after 7 more days
```

### Slack Integration

**Notifications:**
- P0 issues: #incidents
- New P1/P2: #triage-alerts
- Daily digest: #triage-summary

### Discord Bot

**Commands:**
- `/bug` - Create GitHub issue from Discord
- `/feature` - Submit feature request
- `/status GDL-XXXX` - Check issue status

---

## Escalation Procedures

### P0 Escalation

1. **Immediate:** Page on-call engineer
2. **+15 min:** Notify engineering manager
3. **+30 min:** War room assembled
4. **+1 hour:** Executive notification if unresolved

### SLA Breach

**If SLA missed:**
1. Escalate to team lead
2. Provide reason and new ETA
3. Offer workaround if available
4. Document in monthly report

### Dispute Resolution

**If reporter disagrees with priority:**
1. Acknowledge concern
2. Explain priority rationale
3. Offer to reconsider with new information
4. Escalate to product manager if needed

---

## Training

### New Triage Team Member Onboarding

**Week 1:**
- [ ] Shadow experienced triager
- [ ] Review label taxonomy
- [ ] Practice on test issues

**Week 2:**
- [ ] Triage with supervision
- [ ] Component deep dives
- [ ] Meet component owners

**Week 3:**
- [ ] Independent triage
- [ ] Weekly review with mentor
- [ ] Feedback incorporation

**Ongoing:**
- Monthly triage review meetings
- Quarterly process updates
- Annual refresher training

---

## Related Documents

- [On-Call Guide](../launch/on-call.md)
- [Patch Release Process](./patch-releases.md)
- [Incident Response](./incident-response.md)
- [Support SLA](../../community/support-sla.md)
