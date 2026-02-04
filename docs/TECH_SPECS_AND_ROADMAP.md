# DASH PRODUCTION READINESS TECH SPECS & PHASED ROADMAP
## Technical Specification v1.0 - February 4, 2026

---

## 1. TECHNICAL SPECIFICATIONS

### 1.1 Server Unification

**Problem:** Express AND Fastify both try to bind port 3000
**Solution:** Consolidate to Express (primary) with Fastify adapter

**Technical Requirements:**
```typescript
// src/api/server.ts - Unified Server
interface ServerConfig {
  framework: 'express' | 'fastify';
  port: number;
  host: string;
  ssl?: SSLConfig;
}

// Must support:
// - Single port binding
// - Middleware compatibility layer
// - Route registration abstraction
// - WebSocket upgrade handling
```

**Implementation:**
1. Create `src/api/server-factory.ts` - Factory pattern for server creation
2. Migrate Fastify routes to Express compatibility layer
3. Update `src/api/index.ts` to use unified server
4. Remove duplicate server initialization
5. Add server health check endpoint

**Acceptance Criteria:**
- [ ] Server starts on single port
- [ ] All routes functional
- [ ] WebSocket connections work
- [ ] No port conflicts

---

### 1.2 PostgreSQL Persistence Layer

**Problem:** API keys stored in-memory (Map<>), lost on restart
**Solution:** PostgreSQL repository pattern with connection pooling

**Schema:**
```sql
-- api_keys table
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]',
  rate_limit INTEGER DEFAULT 100,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- users table (if not exists)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Repository Pattern:**
```typescript
// src/storage/repositories/ApiKeyRepository.ts
interface ApiKeyRepository {
  create(key: ApiKey): Promise<ApiKey>;
  findByKeyHash(hash: string): Promise<ApiKey | null>;
  findById(id: string): Promise<ApiKey | null>;
  update(id: string, updates: Partial<ApiKey>): Promise<ApiKey>;
  delete(id: string): Promise<void>;
  list(options: ListOptions): Promise<ApiKey[]>;
}

// Implementation with connection pooling
class PostgresApiKeyRepository implements ApiKeyRepository {
  private pool: Pool;
  // ... implementation
}
```

**Migration:**
```typescript
// src/storage/migrations/001_initial_schema.ts
export async function up(pool: Pool): Promise<void> {
  // Create tables
}

export async function down(pool: Pool): Promise<void> {
  // Drop tables
}
```

**Acceptance Criteria:**
- [ ] API keys persist across restarts
- [ ] Connection pooling configured
- [ ] Migration system working
- [ ] Repository pattern implemented

---

### 1.3 bcrypt Replacement

**Problem:** Using BcryptSimulator instead of real bcrypt
**Solution:** Replace with actual bcrypt library

**Implementation:**
```typescript
// src/utils/crypto.ts
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, SALT_ROUNDS);
}
```

**Files to Update:**
- `src/api/middleware/auth.ts` - Replace simulator
- `src/api/store/apiKeyStore.ts` - Use real bcrypt
- `src/enterprise/auth/ldap.ts` - Verify bcrypt usage
- `src/enterprise/auth/saml.ts` - Verify bcrypt usage
- `src/enterprise/auth/oauth.ts` - Verify bcrypt usage

**Acceptance Criteria:**
- [ ] Real bcrypt used for password hashing
- [ ] Real bcrypt used for API key hashing
- [ ] Timing-safe comparison implemented
- [ ] No simulator code remains

---

### 1.4 Circuit Breaker LLM Integration

**Problem:** Circuit breaker exists but NOT integrated into LLM calls
**Solution:** Wrap all LLM provider calls with circuit breaker

**Implementation:**
```typescript
// src/core/llm/circuit-breaker-wrapper.ts
import { CircuitBreaker } from '../utils/circuit-breaker';

interface LLMProvider {
  generate(prompt: string): Promise<string>;
}

class CircuitBreakerLLMWrapper implements LLMProvider {
  private breaker: CircuitBreaker;
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
    this.breaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoringPeriod: 60000
    });
  }

  async generate(prompt: string): Promise<string> {
    return this.breaker.fire(() => this.provider.generate(prompt));
  }
}

// Apply to all LLM providers
// src/core/llm/providers/openai.ts
// src/core/llm/providers/anthropic.ts
// src/core/llm/providers/kimi.ts
```

**Acceptance Criteria:**
- [ ] All LLM calls wrapped with circuit breaker
- [ ] Failure threshold configured
- [ ] Recovery mechanism working
- [ ] Metrics exposed

---

### 1.5 Structured Logging Migration

**Problem:** 349 console statements remain
**Solution:** Migrate to structured logging with Pino

**Implementation:**
```typescript
// src/utils/logger.ts (enhanced)
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.hostname
    })
  },
  redact: {
    paths: ['password', 'token', 'apiKey', '*.password', '*.token'],
    remove: true
  }
});

export default logger;
```

**Migration Script:**
```bash
# scripts/migrate-console-logs.ts
# Find all console.log, console.error, console.warn
# Replace with logger.info, logger.error, logger.warn
# Add context where needed
```

**Acceptance Criteria:**
- [ ] Zero console statements in production code
- [ ] All logs use structured logger
- [ ] Sensitive data redacted
- [ ] Log levels appropriate

---

## 2. PHASED ROADMAP

### PHASE 0: Foundation (Days 1-3)
**Goal:** Fix critical blockers
**Team:** 4 senior subagents

#### 0.1 Git Commit Audit (Day 1)
**Subagent:** git-auditor
**Tasks:**
1. Find all uncommitted changes
2. Verify file existence vs claims
3. Create batch commit plan
4. Commit verified work

**Deliverables:**
- Commit log showing all work
- Git status clean
- All files tracked

#### 0.2 Server Unification (Day 1-2)
**Subagent:** server-architect
**Tasks:**
1. Audit current server setup
2. Design unified server factory
3. Migrate Fastify routes to Express
4. Remove duplicate initialization

**Deliverables:**
- `src/api/server-factory.ts`
- Unified server implementation
- All routes functional

#### 0.3 bcrypt Replacement (Day 2)
**Subagent:** security-engineer
**Tasks:**
1. Replace BcryptSimulator with real bcrypt
2. Update all auth files
3. Verify timing-safe comparison
4. Test password flows

**Deliverables:**
- Real bcrypt implementation
- All simulators removed
- Auth tests passing

#### 0.4 PostgreSQL Persistence (Day 2-3)
**Subagent:** database-engineer
**Tasks:**
1. Design schema for API keys
2. Create repository pattern
3. Implement connection pooling
4. Migration system

**Deliverables:**
- PostgreSQL schema
- Repository implementations
- Migration scripts

---

### PHASE 1: Integration (Days 4-7)
**Goal:** Connect all components
**Team:** 4 senior subagents

#### 1.1 Circuit Breaker Integration (Day 4)
**Subagent:** reliability-engineer
**Tasks:**
1. Wrap all LLM providers
2. Configure thresholds
3. Add metrics collection
4. Test failure scenarios

**Deliverables:**
- Circuit breaker integrated
- LLM calls protected
- Metrics exposed

#### 1.2 Structured Logging (Day 4-5)
**Subagent:** observability-engineer
**Tasks:**
1. Migrate 349 console statements
2. Add context to logs
3. Configure redaction
4. Test log output

**Deliverables:**
- Zero console statements
- Structured logging everywhere
- Sensitive data redacted

#### 1.3 Integration Tests (Day 5-7)
**Subagent:** test-engineer
**Tasks:**
1. Auth flow integration tests
2. WebSocket integration tests
3. Database replication tests
4. End-to-end smoke tests

**Deliverables:**
- Integration test suite
- >80% coverage
- All tests passing

#### 1.4 Security Hardening (Day 6-7)
**Subagent:** security-engineer-2
**Tasks:**
1. Remove hardcoded credentials
2. Fix XSS vulnerabilities
3. Add CSRF protection
4. Security headers review

**Deliverables:**
- No hardcoded secrets
- XSS fixed
- Security tests passing

---

### PHASE 2: Hardening (Days 8-14)
**Goal:** Production-grade reliability
**Team:** 4 senior subagents

#### 2.1 Load Testing (Day 8-9)
**Subagent:** performance-engineer
**Tasks:**
1. 20-agent load test
2. 50-agent load test
3. 100-agent load test
4. Bottleneck identification

**Deliverables:**
- Load test results
- Performance baseline
- Bottleneck report

#### 2.2 Chaos Engineering (Day 9-10)
**Subagent:** chaos-engineer
**Tasks:**
1. Network failure injection
2. Database failure injection
3. LLM provider failure injection
4. Recovery testing

**Deliverables:**
- Chaos test results
- Recovery procedures
- Resilience score

#### 2.3 Security Audit (Day 10-12)
**Subagent:** security-auditor
**Tasks:**
1. Penetration testing
2. Dependency audit
3. Secret scanning
4. Compliance check

**Deliverables:**
- Security audit report
- Vulnerability list
- Remediation plan

#### 2.4 Documentation (Day 12-14)
**Subagent:** tech-writer
**Tasks:**
1. API documentation
2. Deployment guide
3. Runbooks
4. Troubleshooting guide

**Deliverables:**
- Complete documentation
- Deployment runbooks
- On-call procedures

---

### PHASE 3: Production (Days 15-21)
**Goal:** Deploy to production
**Team:** 3 senior subagents

#### 3.1 Staging Deployment (Day 15-16)
**Subagent:** devops-engineer
**Tasks:**
1. Staging environment setup
2. Deployment automation
3. Smoke tests
4. Rollback procedure

**Deliverables:**
- Staging environment
- Deployment pipeline
- Rollback tested

#### 3.2 Production Deployment (Day 17-18)
**Subagent:** devops-engineer-2
**Tasks:**
1. Production environment setup
2. Blue-green deployment
3. Health checks
4. Monitoring setup

**Deliverables:**
- Production environment
- Monitoring dashboards
- Alerting configured

#### 3.3 Monitoring Setup (Day 18-19)
**Subagent:** observability-engineer-2
**Tasks:**
1. Metrics collection
2. Alerting rules
3. Dashboards
4. Log aggregation

**Deliverables:**
- Grafana dashboards
- Alertmanager rules
- Loki log aggregation

#### 3.4 Incident Response (Day 19-21)
**Subagent:** sre-engineer
**Tasks:**
1. Incident response plan
2. On-call rotation
3. Post-mortem template
4. Escalation procedures

**Deliverables:**
- Incident response plan
- On-call runbook
- Post-mortem process

---

## 3. SUBAGENT ASSIGNMENTS

### Phase 0 Subagents
1. **git-auditor** - Git audit and commit
2. **server-architect** - Server unification
3. **security-engineer** - bcrypt replacement
4. **database-engineer** - PostgreSQL persistence

### Phase 1 Subagents
1. **reliability-engineer** - Circuit breaker integration
2. **observability-engineer** - Structured logging
3. **test-engineer** - Integration tests
4. **security-engineer-2** - Security hardening

### Phase 2 Subagents
1. **performance-engineer** - Load testing
2. **chaos-engineer** - Chaos engineering
3. **security-auditor** - Security audit
4. **tech-writer** - Documentation

### Phase 3 Subagents
1. **devops-engineer** - Staging deployment
2. **devops-engineer-2** - Production deployment
3. **observability-engineer-2** - Monitoring
4. **sre-engineer** - Incident response

---

## 4. CRON & HEARTBEAT SETUP

### 4.1 Production Readiness Cron Jobs

```bash
# Every 15 minutes - Progress check
*/15 * * * * cd /Users/jasontang/clawd/projects/dash && \
  bash scripts/check-production-readiness.sh

# Every hour - Commit check
0 * * * * cd /Users/jasontang/clawd/projects/dash && \
  bash scripts/auto-commit.sh "auto: $(date +%H:%M)"

# Every 4 hours - Backup
0 */4 * * * cd /Users/jasontang/clawd/projects/dash && \
  bash scripts/backup.sh
```

### 4.2 Heartbeat Checks

```bash
# Check production readiness
bash scripts/heartbeat-check.sh

# Verify file existence
bash scripts/verify-files.sh

# Check git status
bash scripts/git-status-check.sh
```

---

## 5. SUCCESS CRITERIA

### Phase 0 Success
- [ ] All uncommitted work committed
- [ ] Server starts without conflicts
- [ ] Real bcrypt implemented
- [ ] PostgreSQL persistence working

### Phase 1 Success
- [ ] Circuit breaker integrated
- [ ] Zero console statements
- [ ] Integration tests >80% coverage
- [ ] No hardcoded credentials

### Phase 2 Success
- [ ] 100-agent load test passing
- [ ] Chaos tests passing
- [ ] Security audit clean
- [ ] Documentation complete

### Phase 3 Success
- [ ] Staging deployment successful
- [ ] Production deployment successful
- [ ] Monitoring active
- [ ] Incident response ready

---

## 6. ROLLBACK PLAN

### Rollback Triggers
- Critical bug in production
- Performance degradation
- Security incident
- Data loss

### Rollback Procedure
1. Trigger: `dash rollback --to-version v1.x.x`
2. Database: Run down migrations
3. Config: Restore previous configuration
4. Verify: Health checks pass

---

*Tech Specs v1.0 - Ready for subagent execution*
