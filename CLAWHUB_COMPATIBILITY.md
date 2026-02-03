# ClawHub Compatibility Report

**Date:** 2026-02-02
**Project:** Dash Agent Orchestration Platform
**Location:** /Users/jasontang/clawd/projects/dash
**Status:** ⚠️ Partial Compatibility - Issues Identified

---

## Executive Summary

ClawHub integration in Dash is **functionally implemented** but has **compatibility concerns** related to registry URL configuration and API endpoint versioning. The CLI commands work correctly with mock data fallback when the API is unavailable, but the hardcoded registry URL may not match the actual ClawHub service endpoint.

---

## Test Results

### ✅ Test 1: `dash clawhub search`

**Command:**
```bash
node dist/index.js clawhub search "typescript"
```

**Result:**
```
🔍 Searching ClawHub...
[4:58:43 PM] INFO  [ClawHubClient] Initialized with registry: https://clawhub.ai/api/v1
[4:58:43 PM] INFO  [ClawHubClient] Fetching all skills for search
No skills found matching your query.

Tips:
  - Try a broader search term
  - Check for typos
  - Browse all skills at https://clawhub.ai
[4:58:43 PM] WARN  [ClawHubClient] API unavailable, using mock data
```

**Status:** ✅ Working (with mock data fallback)

**Command (empty query):**
```bash
node dist/index.js clawhub search
```

**Result:**
```
🔍 Searching ClawHub...
[4:58:57 PM] INFO  [ClawHubClient] Initialized with registry: https://clawhub.ai/api/v1
[4:58:57 PM] INFO  [ClawHubClient] Fetching all skills for search
Found 5 skills:

  PostgreSQL Backup postgres-backup  342 ⭐ 15.4k ↓
   Automated PostgreSQL database backups with scheduling and retention...

  AWS Deploy aws-deploy  215 ⭐ 8.9k ↓
   Deploy applications to AWS EC2, ECS, or Lambda with one command.

  Slack Notifications slack-notify  178 ⭐ 6.2k ↓
   Send rich Slack notifications from your workflows with templates.

  Docker Build Optimizer docker-build  567 ⭐ 23.1k ↓
   Build Docker images with layer caching and multi-arch support.

  GitHub Release Manager github-release  289 ⭐ 11.2k ↓
   Automate GitHub releases with changelog generation and asset uploads.
```

**Status:** ✅ Working (returns mock skills list)

---

### ✅ Test 2: `dash clawhub list`

**Command:**
```bash
node dist/index.js clawhub list
```

**Result:**
```
[4:58:47 PM] INFO  [ClawHubClient] Initialized with registry: https://clawhub.ai/api/v1
No skills installed.

Install skills with:
  dash clawhub install <skill>

Search for skills with:
  dash clawhub search <query>
```

**Status:** ✅ Working

---

### ❌ Test 3: `dash clawhub install`

**Command:**
```bash
node dist/index.js clawhub install postgres-backup
```

**Result:**
```
📦 Installing postgres-backup...
[4:59:02 PM] INFO  [ClawHubClient] Initialized with registry: https://clawhub.ai/api/v1
Fetching skill metadata...
[4:59:02 PM] ERROR [ClawHubClient] Failed to fetch skill postgres-backup: {"error":"TypeError: fetch failed"}
❌ Installation failed
   Error: Failed to fetch skill postgres-backup: fetch failed
```

**Status:** ❌ Failing (Network/API unreachable)

---

## Issues Identified

### Issue 1: Registry URL Mismatch ⚠️ **HIGH PRIORITY**

**Problem:**
The code hardcodes `https://clawhub.ai/api/v1` as the registry base URL, but documentation and other sources reference different endpoints:

| Source | Registry URL | API Base |
|--------|--------------|----------|
| Dash code | `clawhub.ai` | `/api/v1` |
| OpenClaw docs | `clawhub.ai` | `/api` (no `/v1`) |
| Some references | `clawhub.com` | Unknown |

**Evidence:**
- Current implementation: `src/integrations/openclaw/ClawHubClient.ts` line ~21
- OpenClaw documentation: `https://docs.openclaw.ai/tools/clawhub`

**Impact:**
- API calls may fail if the actual endpoint uses `/api` instead of `/api/v1`
- Users cannot override the default registry URL without code changes

**Recommended Fix:**
1. Add environment variable support for `CLAWHUB_REGISTRY` to override the base URL
2. Implement API version fallback (try `/api/v1`, then `/api`)
3. Update documentation with correct registry URL

---

### Issue 2: Install Command Lacks Mock Fallback ⚠️ **MEDIUM PRIORITY**

**Problem:**
The `search` command gracefully falls back to mock data when the API is unavailable, but `install` does not. The install command fails with a generic "fetch failed" error.

**Expected Behavior:**
When API is unavailable, install should either:
- Provide a clear error message about network connectivity
- Support offline installation from cache/mock for testing
- Display the full URL that was attempted

**Current Behavior:**
```
[4:59:02 PM] ERROR [ClawHubClient] Failed to fetch skill postgres-backup: {"error":"TypeError: fetch failed"}
```

**Recommended Fix:**
Add URL logging to error messages:
```typescript
logger.error(`Failed to fetch skill ${name} from ${url}: ${error.message}`);
```

---

### Issue 3: Logger Output Order ⚠️ **LOW PRIORITY**

**Problem:**
The warning about mock data appears after the search results/tips, suggesting a logger ordering issue.

**Example:**
```
No skills found matching your query.
Tips:
  - Try a broader search term
[4:58:43 PM] WARN  [ClawHubClient] API unavailable, using mock data
```

**Recommended Fix:**
Ensure mock data warning is logged before search results are displayed.

---

## Code Analysis

### Relevant Files

1. **`src/integrations/openclaw/ClawHubClient.ts`**
   - Lines 21-30: Default configuration with registry URL
   - Lines 178-248: `fetchAllSkills()` method with API fallback logic
   - Lines 248+: Search implementation with mock data fallback

2. **`src/commands/clawhub.ts`**
   - Command registration for `clawhub search`, `list`, `install`

3. **`BUGFIX_CLAWHUB_LIST.md`**
   - Documents previous lazy-loading fix

4. **`BUGFIX_CLAWHUB_SEARCH.md`**
   - Documents previous 500 error fix

### Current Configuration

```typescript
// From ClawHubClient.ts
export const DEFAULT_CLAWHUB_CONFIG: ClawhubClientConfig = {
  registryUrl: process.env.CLAWHUB_REGISTRY || 'https://clawhub.ai',
  apiBase: '/api/v1',
  cacheDir: '.cache/clawhub',
  timeout: 30000,
};
```

**Note:** The code already supports `CLAWHUB_REGISTRY` environment variable, but the default may be incorrect.

---

## Recommendations

### Immediate Actions

1. **Verify Correct Registry URL**
   - Contact ClawHub maintainers or check official documentation
   - Confirm if endpoint is `https://clawhub.ai/api/v1` or `https://clawhub.ai/api`

2. **Test with Network Access**
   ```bash
   # Set explicit registry for testing
   export CLAWHUB_REGISTRY=https://clawhub.ai
   
   # Test all commands
   dash clawhub search
   dash clawhub list
   dash clawhub install <skill-name>
   ```

3. **Add URL to Error Messages**
   - Update `ClawHubClient.ts` to include attempted URL in fetch errors

### Long-term Improvements

1. **Add Health Check Command**
   ```bash
   dash clawhub status
   # Should show:
   # - Registry URL
   # - API connectivity
   # - Response time
   # - Available skills count
   ```

2. **Support Multiple Registry Sources**
   - Primary: ClawHub official registry
   - Secondary: Custom/private registries
   - Fallback: Mock data for development

3. **Improve Documentation**
   - Add `CLAWHUB_REGISTRY` to environment variable documentation
   - Document API endpoint configuration
   - Provide troubleshooting guide

---

## Verification Checklist

- [x] `dash clawhub search <query>` - Works with mock data
- [x] `dash clawhub search` (no args) - Lists available mock skills
- [x] `dash clawhub list` - Shows installed skills (empty)
- [ ] `dash clawhub install <skill>` - ❌ Fails (network/API issue)
- [x] `dash clawhub search --help` - Shows correct options
- [ ] `CLAWHUB_REGISTRY` override - Needs verification

---

## Conclusion

**ClawHub compatibility is PARTIAL.**

- ✅ CLI structure and commands are correctly implemented
- ✅ Mock data fallback works for search
- ✅ List command functions properly
- ❌ Install command cannot verify due to potential registry URL mismatch
- ❌ API endpoint configuration may be outdated

**Next Steps:**
1. Verify correct ClawHub registry URL and API version
2. Update default configuration if needed
3. Re-test install command with correct endpoint
4. Add environment variable documentation

---

## References

- [OpenClaw ClawHub Documentation](https://docs.openclaw.ai/tools/clawhub)
- `BUGFIX_CLAWHUB_LIST.md` - Previous lazy-loading fix
- `BUGFIX_CLAWHUB_SEARCH.md` - Previous API error fix
- `src/integrations/openclaw/ClawHubClient.ts` - Main client implementation
