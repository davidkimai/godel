# PHASE 1 SUBAGENT SPECIFICATIONS
## Godel Production Readiness - Integration Phase

---

## 🚀 PHASE 1 LAUNCH: CODEX-LED SUBAGENTS

**CLI Strategy:**
- **Codex CLI** → Code implementation (primary)
- **Claude Code CLI** → Architecture/design reviews (secondary)
- **Kimi CLI** → Research/fallback (tertiary)

### Subagent 1: godel-reliability-engineer (Codex CLI)

### Mission
Implement circuit breaker pattern for all LLM API calls to prevent cascading failures

### Deliverables
1. **Circuit Breaker Implementation**
   - Create `src/utils/circuitBreaker.ts`
   - States: CLOSED, OPEN, HALF_OPEN
   - Configurable thresholds (failure count, timeout, reset timeout)
   - Exponential backoff for retries

2. **LLM Integration Points**
   - Wrap all OpenAI API calls
   - Wrap all Anthropic API calls
   - Wrap all Gemini API calls
   - Store circuit state per provider

3. **Monitoring**
   - Circuit state metrics
   - Failure rate tracking
   - Alert on circuit open

### Success Criteria
- [ ] Circuit breaker wraps all LLM calls
- [ ] Fails fast when provider down
- [ ] Auto-recovery after timeout
- [ ] Configurable per-provider

---

## Subagent 2: godel-observability-engineer (Codex CLI)

### Mission
Migrate 1,105 console.log statements to structured logging with Pino

### Deliverables
1. **Logger Setup**
   - Install pino: `npm install pino pino-pretty`
   - Create `src/utils/logger.ts` with structured logger
   - Configurable log levels (debug, info, warn, error)
   - JSON output for production

2. **Log Categories**
   - `logger.http` - HTTP requests/responses
   - `logger.db` - Database operations
   - `logger.llm` - LLM API calls
   - `logger.auth` - Authentication events
   - `logger.agent` - Agent lifecycle
   - `logger.system` - System events

3. **Migration Strategy**
   - Replace all console.log with appropriate logger method
   - Add context (requestId, agentId, timestamp)
   - Keep log correlation IDs
   - Remove 1,105 console statements

### Success Criteria
- [ ] Zero console.log statements remain
- [ ] All logs structured with JSON
- [ ] Correlation IDs present
- [ ] Log levels respected

---

## Subagent 3: godel-test-engineer (Codex CLI)

### Mission
Achieve >80% test coverage with integration tests

### Deliverables
1. **Test Infrastructure**
   - Configure Jest for integration tests
   - Test database setup/teardown
   - Mock external APIs
   - Test fixtures

2. **Test Suites**
   - API endpoint tests (all routes)
   - Database repository tests
   - Authentication flow tests
   - LLM integration tests (mocked)
   - Circuit breaker tests
   - Error handling tests

3. **Coverage Report**
   - Statement coverage >80%
   - Branch coverage >75%
   - Function coverage >85%
   - Line coverage >80%

### Success Criteria
- [ ] Integration tests for all API endpoints
- [ ] Coverage threshold >80%
- [ ] All tests passing
- [ ] CI-ready test suite

---

## Subagent 4: godel-security-engineer-2 (Codex CLI)

### Mission
Security hardening - remove all hardcoded credentials and secrets

### Deliverables
1. **Secret Scanning**
   - Scan entire codebase for hardcoded secrets
   - Check for API keys in source
   - Check for passwords in config
   - Check for tokens in tests

2. **Secure Configuration**
   - All secrets via environment variables
   - `.env.example` template
   - Secret validation on startup
   - Fail fast if required secrets missing

3. **Security Headers**
   - Helmet.js configured
   - CSP policies
   - HSTS enabled
   - X-Frame-Options

4. **Input Validation**
   - Validate all API inputs
   - SQL injection prevention
   - XSS prevention
   - Rate limiting verified

### Success Criteria
- [ ] Zero hardcoded credentials
- [ ] All secrets in environment
- [ ] Security headers present
- [ ] Input validation on all endpoints

---

## Phase 1 Dependencies

```
Reliability Engineer ─────┐
                         ├──→ All complete → Phase 2
Observability Engineer ───┤
                         │
Test Engineer ────────────┤
                         │
Security Engineer 2 ──────┘
```

All 4 subagents can run in parallel.

---

## Phase 1 Entry Criteria
- [x] Phase 0 complete
- [x] Gatekeeper approval
- [x] Git status clean
- [x] Build passing

## Phase 1 Exit Criteria
- [ ] All 4 subagents complete
- [ ] Circuit breaker implemented
- [ ] Zero console.log statements
- [ ] >80% test coverage
- [ ] Zero hardcoded credentials
- [ ] Gatekeeper approval

---

*Specifications Ready for Launch*
