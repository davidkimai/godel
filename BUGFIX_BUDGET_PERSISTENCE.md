# Bugfix: Budget Persistence

## Issue
Budget configurations were stored in-memory only (using Maps in `src/safety/budget.ts`). When the CLI process exited, all budget configurations were lost.

## Solution
Implemented file-based persistence using the same pattern as OpenClaw state management (`src/utils/cli-state.ts`).

## Changes Made

### 1. Modified `src/safety/budget.ts`

#### Added Persistence Infrastructure
- Added imports for `fs`, `path`, `os` modules
- Added `BUDGETS_DIR` and `BUDGETS_FILE` constants (`~/.config/dash/budgets.json`)
- Added `PersistedBudgets` interface for JSON serialization

#### Added Persistence Functions
- `ensureBudgetsDir()` - Creates config directory if missing
- `loadPersistedBudgets()` - Loads budgets from disk on module initialization
- `savePersistedBudgets()` - Saves budgets to disk after any change
- `getBudgetsFilePath()` - Returns the path to budgets file (for debugging)

#### Updated Storage Initialization
- Changed `budgetConfigs` from `const` to `let` to allow reassignment from file
- Added `loadPersistedBudgets()` call at module initialization
- Budget configs are now restored from file when the module loads

#### Added New Public Functions
- `listBudgetConfigs()` - List all budget configurations
- `listBudgetConfigsByType(type)` - List budgets filtered by type
- `deleteBudgetConfig(type, scope)` - Delete a specific budget configuration
- `clearAllBudgetConfigs()` - Clear all budget configurations
- `clearAllBudgetAlerts()` - Clear all budget alerts

#### Updated Functions to Persist Changes
- `setBudgetConfig()` - Now calls `savePersistedBudgets()` after setting config
- `addBudgetAlert()` - Now calls `savePersistedBudgets()` after adding alert
- `removeBudgetAlert()` - Now calls `savePersistedBudgets()` after removing alert
- `deleteBudgetConfig()` - Now calls `savePersistedBudgets()` after deleting
- `clearAllBudgetConfigs()` - Now calls `savePersistedBudgets()` after clearing
- `clearAllBudgetAlerts()` - Now calls `savePersistedBudgets()` after clearing

## Test Results

### Test 1: Budget Set and Persist
```bash
$ node dist/index.js budget set --project persist-test --daily 100 --cost 10
✅ Project daily budget set: 100 tokens / $10.0000
   Project: persist-test
   Reset: 0:00 UTC
```

### Test 2: File Persistence Verification
```bash
$ cat ~/.config/dash/budgets.json
{
  "configs": {
    "project:persist-test": {
      "type": "project",
      "scope": "persist-test",
      "maxTokens": 100,
      "maxCost": 10,
      "period": "daily",
      "resetHour": "0"
    }
  },
  "alerts": {},
  "version": "1.0.0",
  "updatedAt": "2026-02-02T22:21:44.296Z"
}
```

### Test 3: Status Reads From Persisted File
```bash
$ node dist/index.js budget status --project persist-test
BUDGET STATUS: Project persist-test
════════════════════════════════════════════════════════════
Budget: 100 tokens / $10.0000
Used: $0.0000 (0.0%)
Remaining: $10.0000

Active Budgets: 0
```

### Test 4: Cross-CLI Invocation Persistence
```bash
# First CLI invocation
$ node dist/index.js budget set --project fresh-test --daily 200 --cost 20
✅ Project daily budget set: 200 tokens / $20.0000

# Second CLI invocation (new process)
$ node dist/index.js budget status --project fresh-test
Budget: 200 tokens / $20.0000
Used: $0.0000 (0.0%)
```

## Build Status
- Budget module compiles successfully with 0 errors
- Build size: 19,722 bytes for `dist/safety/budget.js`
- Pre-existing errors in `src/cli/commands/status.ts` are unrelated to this change

## Storage Location
Budgets are stored at: `~/.config/dash/budgets.json`

## Backward Compatibility
- Existing in-memory behavior is preserved for active budgets (runtime only)
- Budget configurations now survive process restarts
- No breaking changes to the API
