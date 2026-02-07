# TypeScript Strictness and Type Quality Audit Report

## Summary

This report documents the TypeScript strictness compliance audit performed on the Godel codebase.

### Initial State
- **Strict Mode**: Disabled (`strict: false` in tsconfig.json)
- **Total TypeScript Files**: ~483 files in src/
- **Scoped Files**: 196 files in core/, federation/, loop/, intent/, autonomic/, api/, cli/

### Changes Made

#### 1. Fixed Files in Scope

##### src/federation/cluster/cluster-registry.ts
- **Issue**: Duplicate property overwrites due to spread operator with defaults
- **Fix**: Changed to explicit property assignments with nullish coalescing

##### src/core/event-bus-redis.ts  
- **Issues**:
  - `retryConfig` properties potentially undefined
  - `maxListeners` potentially undefined
- **Fixes**:
  - Added optional chaining with default values (`?? 3`, `?? 1000`, `?? 10000`)
  - Added type annotations to retryStrategy functions

##### src/loop/aggregate.ts
- **Issue**: Implicit `any` in event handler return type
- **Fix**: Changed `EventHandler` to `EventHandler<unknown>`

##### src/api/routes/worktrees.ts
- **Issues**:
  - `manager` potentially null
  - Type mismatches for `CleanupOptions` and `WorktreeConfig`
- **Fixes**:
  - Added null check with early throw
  - Renamed `deleteBranch` to `removeBranch` to match interface

##### src/api/routes/state.ts
- **Issues**:
  - Multiple `any` type usages
  - Index signature issues with AgentStorage
  - Agent type mismatches (missing properties like `name`, `currentLoad`)
- **Fixes**:
  - Created `AgentStateView` interface extending Agent with runtime properties
  - Changed from index access to `.get()` method
  - Replaced `any` with proper types

##### src/api/schemas/agent.ts
- **Issue**: Recursive Zod schema type inference failure
- **Fix**: Added explicit `FileNode` type and used `z.ZodType<FileNode>`

##### src/autonomic/error-listener.ts
- **Issue**: Event handler type incompatibility
- **Fix**: Cast event to BusErrorEvent in handler

##### src/cli/commands/state.ts
- **Issues**: Similar to api/routes/state.ts
- **Fixes**: Applied same `AgentStateView` pattern

##### src/api/lib/pagination.ts
- **Issue**: Return type `Required<CursorPaginationParams>` required non-optional cursor
- **Fix**: Changed to `Required<Omit<...>> & { cursor?: string }`

##### src/api/routes/dashboard.ts
- **Issues**: 
  - `team_id` property access (should be `teamId`)
  - `budget_allocated` and `budget_consumed` potentially undefined
- **Fixes**: 
  - Fixed property name
  - Added nullish coalescing (`?? 0`)

##### src/api/routes/federation.ts
- **Issue**: Empty config object not assignable to required properties
- **Fix**: Provided complete default config object

##### src/api/routes/events.ts
- **Issue**: 
  - Severity type mismatch ('warn' vs 'warning')
  - 'limit' not in ResponseMeta
- **Fixes**:
  - Mapped 'warn' to 'warning'
  - Changed to 'pageSize'

##### src/core/session-tree.ts
- **Issue**: `sessionId` not definitely assigned in constructor
- **Fix**: Added definite assignment assertion (`!`)

##### src/core/extension-loader.ts
- **Issue**: Generic function signature mismatch
- **Fix**: Added explicit type parameters and cast

#### 2. Type Definition Improvements

##### AgentStateView Interface
Created to bridge the gap between the base `Agent` model and runtime properties:
```typescript
interface AgentStateView extends Agent {
  name?: string;
  currentLoad?: number;
  lastActivity?: number;
  stateEntryTime?: number;
  stateHistory?: Array<...>;
}
```

### Remaining Issues

#### Files with Most Errors
1. `src/core/state-aware-orchestrator.ts` (29 errors) - Missing imports from team-orchestrator
2. `src/api/routes/dashboard.ts` (24 errors) - Property access issues
3. `src/api/routes/pi.ts` (10 errors) - Type mismatches
4. `src/loop/aggregate.ts` (7 errors) - Return type issues
5. `src/api/routes/roles.ts` (5 errors) - Missing error codes

#### Common Remaining Issues
1. **Missing error code definitions** (`ROLE_NOT_FOUND`, `REGISTRY_NOT_INITIALIZED`)
2. **Module resolution issues** (`./skills`, `js-yaml` types)
3. **Import/export mismatches** (`TeamConfig`, `TeamState` not exported)
4. **Property access on union types** (dashboard routes)

### Recommendations

1. **Enable Strict Mode Incrementally**:
   ```json
   {
     "strictNullChecks": true,
     "noImplicitAny": true,
     "strictFunctionTypes": true
   }
   ```

2. **Add Missing Type Declarations**:
   - Install `@types/js-yaml`
   - Fix or remove broken imports

3. **Standardize Error Codes**:
   - Add missing error codes to ErrorCodes enum
   - Audit all error code usages

4. **Refactor Agent Type**:
   - Consider merging Agent and AgentStateView
   - Document runtime-added properties

5. **Fix Module Exports**:
   - Export missing types from team-orchestrator
   - Fix skills module resolution

### Files Modified

1. src/federation/cluster/cluster-registry.ts
2. src/core/event-bus-redis.ts
3. src/loop/aggregate.ts
4. src/api/routes/worktrees.ts
5. src/api/routes/state.ts
6. src/api/schemas/agent.ts
7. src/autonomic/error-listener.ts
8. src/cli/commands/state.ts
9. src/api/lib/pagination.ts
10. src/api/routes/dashboard.ts
11. src/api/routes/federation.ts
12. src/api/routes/events.ts
13. src/core/session-tree.ts
14. src/core/extension-loader.ts

### Verification

After fixes, the following strict mode errors remain in scoped directories:
- **92 errors** in 14 files (down from initial 58 in 17 files - but more errors revealed)

### Next Steps

1. Fix remaining errors in state-aware-orchestrator.ts
2. Fix dashboard.ts property access issues
3. Add missing error codes
4. Resolve module import issues
5. Enable strict mode in tsconfig.json once all errors are resolved
