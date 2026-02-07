# Godel On-Call Rotation Guide

**Version:** 1.0  
**Effective Date:** TBD  
**Rotation Schedule:** https://pagerduty.com/godel-oncall

---

## Overview

This guide defines the on-call rotation structure, responsibilities, and procedures for the Godel platform engineering team.

---

## Rotation Structure

### Primary Rotation (24/7 Coverage)

```
Week 1: Alice (Primary) + Bob (Secondary)
Week 2: Bob (Primary) + Carol (Secondary)
Week 3: Carol (Primary) + Dave (Secondary)
Week 4: Dave (Primary) + Alice (Secondary)
```

### Shadow Rotation (New Team Members)
- Duration: 4 weeks
- Schedule: Business hours only (9 AM - 6 PM local time)
- Responsibility: Observe and learn, no solo paging

### Escalation Path

```
Level 1: On-Call Engineer (Primary)
    ↓ (No response in 15 min or needs help)
Level 2: On-Call Engineer (Secondary)
    ↓ (Critical incident, no response in 10 min)
Level 3: Engineering Manager
    ↓ (Service-wide outage)
Level 4: VP Engineering / CTO
```

---

## Responsibilities

### Primary On-Call

**Availability:**
- 24/7 availability during rotation week
- Acknowledge pages within 5 minutes
- Respond to incidents within 15 minutes
- Reliable internet and laptop access

**Duties:**
- Respond to all alerts and pages
- Triage and classify incidents
- Execute runbooks for known issues
- Communicate status to stakeholders
- Document all incidents
- Coordinate with secondary if needed

### Secondary On-Call

**Availability:**
- Backup support during primary's unavailability
- Escalation point for complex issues
- On-site support if needed

**Duties:**
- Support primary on complex incidents
- Take over if primary is unavailable
- Provide domain expertise
- Post-incident review facilitation

---

## Incident Severity Levels

### SEV-1: Critical

**Criteria:**
- Complete service outage
- Data loss or corruption
- Security breach
- Revenue-impacting failure

**Response:**
- Immediate response required
- War room activated
- Executive notification
- Public status page updated
- Post-mortem within 24 hours

**Examples:**
- All API endpoints returning 500
- Database unavailable
- Authentication system down
- Unauthorized access detected

### SEV-2: Major

**Criteria:**
- Significant functionality degraded
- Major feature unavailable
- Performance severely impacted
- Workaround exists but painful

**Response:**
- Respond within 30 minutes
- Team lead notification
- Status page updated
- Post-mortem within 48 hours

**Examples:**
- Task engine processing delayed > 5 min
- 50% of requests failing
- Specific runtime type unavailable

### SEV-3: Minor

**Criteria:**
- Non-critical functionality affected
- Partial degradation
- No immediate user impact

**Response:**
- Respond within 2 hours
- Track in incident log
- Fix during business hours

**Examples:**
- Metrics delay
- Non-critical background job failure
- Minor UI issues

### SEV-4: Informational

**Criteria:**
- No user impact
- Potential issue detected
- Preventive maintenance needed

**Response:**
- Review during next business day
- Schedule fix as appropriate

---

## On-Call Procedures

### When Paged

1. **Acknowledge** the alert immediately
2. **Assess** the severity using criteria above
3. **Communicate** in #incident-response channel:
   ```
   🚨 SEV-1: API Gateway returning 500s
   - Started: 14:23 UTC
   - Impact: All API calls failing
   - Actions: Investigating
   ```
4. **Execute** relevant runbook if available
5. **Escalate** if needed (see escalation path)
6. **Document** actions taken in incident tracking

### Communication Templates

#### Initial Alert
```
🚨 [SEV-X] [Brief Description]
Time: [ISO 8601 timestamp]
Impact: [What's affected]
Status: Investigating
Engineer: [@your-handle]
```

#### Status Update (every 30 min for SEV-1)
```
📊 Update [X] on [Incident Name]
Time: [Current time]
Progress: [What we've tried/learned]
ETA: [When we expect resolution]
Next Update: [Time of next update]
```

#### All Clear
```
✅ RESOLVED: [Incident Name]
Duration: [X minutes]
Resolution: [What fixed it]
Post-mortem: [Link or ETA]
```

---

## Handoff Procedure

### End of Shift Handoff

**Outgoing Engineer:**
1. Review all open incidents
2. Document ongoing investigations
3. Note any alerts to watch
4. Update runbooks if needed

**Handoff Meeting (15 min):**
- Active incidents and status
- Alert fatigue issues
- System anomalies observed
- Follow-up items

### Handoff Template
```markdown
## On-Call Handoff: [Date] → [Date]

### Incidents During Shift
| Time | Severity | Description | Status |
|------|----------|-------------|--------|
| | | | |

### Alerts to Watch
- [Alert name] - [Why it's concerning]

### System Notes
- [Any observations about system behavior]

### Follow-ups
- [ ] Action item 1
- [ ] Action item 2
```

---

## Compensation & Time Off

### On-Call Compensation
- Primary on-call: [Company-specific]
- Weekend/holiday premium: [Company-specific]
- Incident response bonus: [Company-specific]

### Time Off After Rotation
- Minimum 2 weeks before next primary rotation
- Flexible hours day after rotation ends
- No early meetings day after heavy incident night

### Shadow Program Benefits
- Counts toward on-call readiness
- Mentorship hours credit
- Priority for next rotation signup

---

## Tools & Access

### Required Tools
- PagerDuty (primary paging)
- Slack (communication)
- Grafana (monitoring)
- AWS Console (infrastructure)
- kubectl (Kubernetes access)
- Runbook repository

### Access Checklist
- [ ] PagerDuty account configured
- [ ] SSH keys to production
- [ ] VPN access verified
- [ ] AWS credentials active
- [ ] Database read access
- [ ] Log aggregation access

---

## Runbook Index

### Service Recovery
- [API Gateway Down](../../maintenance/runbooks/api-gateway-recovery.md)
- [Database Failover](../../maintenance/runbooks/database-failover.md)
- [Cache Warming](../../maintenance/runbooks/cache-warming.md)

### Performance Issues
- [High Latency Investigation](../../maintenance/runbooks/latency-investigation.md)
- [Memory Leak Diagnosis](../../maintenance/runbooks/memory-leak.md)
- [Database Slow Queries](../../maintenance/runbooks/slow-queries.md)

### Security Incidents
- [DDoS Response](../../maintenance/runbooks/ddos-response.md)
- [Unauthorized Access](../../maintenance/runbooks/security-incident.md)
- [Data Breach Procedure](../../maintenance/runbooks/data-breach.md)

---

## Wellness & Sustainability

### Preventing Burnout
- Strict 8-hour shift maximum for active incidents
- Mandatory handoff if > 3 hours continuous work
- No on-call during planned PTO
- Quarterly on-call load review

### Alert Quality
- Weekly alert review meeting
- Suppress flaky alerts
- Tune thresholds to reduce noise
- Target < 5 pages per week

### Feedback
- Monthly on-call retro
- Anonymous feedback form
- Rotation preference collection
- Continuous improvement focus

---

## Schedule Management

### Calendar Integration
- PagerDuty syncs with Google Calendar
- Block primary on-call days
- Automatic secondary escalation

### Shift Swaps
- Self-service via PagerDuty
- Minimum 48-hour notice
- Manager approval for < 48 hours
- Document reason for audit

### Holiday Coverage
- Rotated fairly across team
- Volunteer-first approach
- Extra compensation for major holidays
- Planned 6 months in advance

---

## Related Documents

- [Incident Response](../maintenance/incident-response.md)
- [Monitoring Dashboard](./monitoring-dashboard.md)
- [Launch Day Plan](./launch-plan.md)
- [Escalation Contacts](./escalation-contacts.md)
