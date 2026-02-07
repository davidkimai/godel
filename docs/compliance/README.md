# Godel Compliance Documentation

This directory contains all compliance-related documentation for the Godel platform, supporting SOC2, GDPR, HIPAA, and other regulatory requirements.

## Directory Structure

```
docs/compliance/
├── README.md              # This file
├── soc2/                  # SOC2 compliance documentation
├── gdpr/                  # GDPR compliance documentation
├── hipaa/                 # HIPAA compliance documentation (if applicable)
├── policies/              # Security policies
└── procedures/            # Security procedures and runbooks
```

## Compliance Frameworks

### SOC2 Type II

SOC2 (Service Organization Control 2) is an auditing procedure that ensures service providers securely manage data to protect the interests and privacy of their clients.

**Trust Services Criteria:**
- Security (Common Criteria)
- Availability
- Processing Integrity
- Confidentiality
- Privacy

See [SOC2 Documentation](./soc2/README.md) for details.

### GDPR

General Data Protection Regulation (GDPR) compliance for EU data subjects.

**Key Principles:**
- Lawfulness, Fairness, and Transparency
- Purpose Limitation
- Data Minimization
- Accuracy
- Storage Limitation
- Integrity and Confidentiality
- Accountability

See [GDPR Documentation](./gdpr/README.md) for details.

### HIPAA

Health Insurance Portability and Accountability Act compliance for healthcare data (if applicable).

See [HIPAA Documentation](./hipaa/README.md) for details.

## Security Controls Overview

| Control Category | Implementation | Status |
|-----------------|----------------|--------|
| Access Control | RBAC with SSO | ✅ Implemented |
| Audit Logging | Comprehensive event logging | ✅ Implemented |
| Data Encryption | AES-256-GCM at rest, TLS in transit | ✅ Implemented |
| PII Protection | Detection and masking | ✅ Implemented |
| Authentication | LDAP, SAML, OAuth/OIDC | ✅ Implemented |
| Authorization | Role-based permissions | ✅ Implemented |

## Role Hierarchy

```
super_admin
    └── Full system access
    
admin
    ├── User management
    ├── Team management
    └── Configuration access
    
operator
    ├── Agent operations
    ├── Workflow execution
    └── Monitoring access
    
viewer
    └── Read-only access
```

## Quick Reference

### Security Contact
- **Security Team:** security@godel.ai
- **Incident Response:** incident@godel.ai
- **Data Protection Officer:** dpo@godel.ai

### Audit Log Retention
- Authentication events: 365 days
- Authorization events: 365 days
- Data access: 90 days
- Security events: 730 days
- Compliance events: 2555 days (7 years)

### Encryption Standards
- **At Rest:** AES-256-GCM
- **In Transit:** TLS 1.3
- **Key Derivation:** scrypt (memory-hard)
- **Hashing:** SHA-256 or SHA-512

## Getting Started

1. Review the [Security Policies](./policies/README.md)
2. Understand [RBAC Configuration](../../src/security/rbac/roles.ts)
3. Review [Audit Event Types](../../src/security/audit/events.ts)
4. Check [PII Detection Rules](../../src/security/pii/detector.ts)

## Contributing

When adding new security features:

1. Update relevant compliance documentation
2. Add audit logging for security events
3. Update RBAC permissions if needed
4. Document in CHANGELOG.md
5. Update this README
