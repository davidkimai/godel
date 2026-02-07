# Godel Autonomic Maintenance Swarm

Self-maintaining maintenance system that automatically detects, diagnoses, and fixes bugs in the Godel codebase.

This module provides autonomous error detection and remediation capabilities.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Error Event Bus                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Maintenance Swarm                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Error      │  │   Test       │  │   Patch      │      │
│  │   Listener   │──►│   Writer     │──►│   Agent      │      │
│  │   (Always    │  │   (Reproduces │  │   (Fixes     │      │
│  │    On)       │  │    bug)      │  │    code)     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                              │              │
│                                              ▼              │
│                                       ┌──────────────┐     │
│                                       │   PR Agent   │     │
│                                       │   (Submits   │     │
│                                       │    fix)      │     │
│                                       └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Error Listener Service (`error-listener.ts`)

Monitors the event bus for errors and manages the error queue.

**Features:**
- Real-time error detection from event bus
- Error deduplication (fuzzy matching on messages and stack traces)
- Severity assessment (low/medium/high/critical)
- Auto-fixable detection

**Error Types Considered Auto-Fixable:**
- `TypeError`
- `ReferenceError`
- `SyntaxError`
- `AssertionError`
- `TimeoutError`
- Module not found errors

### 2. Test Writer Agent (`test-writer.ts`)

Generates reproduction tests using LLM.

**Process:**
1. Reads source file where error occurred
2. Reads existing tests for context
3. Generates Jest test that reproduces the error
4. Validates test compiles and reproduces the error

**Output:**
- Reproduction test code
- Test file path
- Confirmation that error is reproduced

### 3. Patch Agent (`patch-agent.ts`)

Generates code fixes based on reproduction tests.

**Process:**
1. Reads failing source code
2. Uses LLM to analyze error and generate fix
3. Applies fix to file
4. Runs reproduction test to verify
5. Reverts changes if test fails

**Safety Features:**
- Original code backup before changes
- Automatic reversion on test failure
- Minimal change principle

### 4. PR Agent (`pr-agent.ts`)

Submits fixes as pull requests.

**Process:**
1. Creates feature branch (`autonomic/fix-{error-id}`)
2. Applies file changes
3. Commits with descriptive message
4. Pushes to origin
5. Creates GitHub PR with detailed description

### 5. Orchestrator (`orchestrator.ts`)

Coordinates the entire maintenance swarm.

**Features:**
- Event-driven pipeline execution
- Job tracking and status management
- Configurable polling intervals
- Concurrent job limiting
- Pause/resume functionality

## CLI Commands

```bash
# Show maintenance swarm status
swarmctl autonomic status

# Start maintenance swarm
swarmctl autonomic start

# Stop maintenance swarm
swarmctl autonomic stop

# Pause maintenance swarm
swarmctl autonomic pause

# Resume maintenance swarm
swarmctl autonomic resume

# List errors in queue
swarmctl autonomic list

# Manually trigger fix for error
swarmctl autonomic fix <error-id>

# Create demo error for testing
swarmctl autonomic demo
```

## Usage Example

```bash
# Start the maintenance swarm
swarmctl autonomic start

# Check status
swarmctl autonomic status

# Output:
# Autonomic Maintenance Swarm Status
# 
# Status: Running
# 
# Error Queue:
#   Unprocessed:  3
#   Auto-fixable: 2
#   Processing:   1
#   Resolved:     5

# When error occurs, the system automatically:
# [DETECT] Error: TypeError in task-executor.ts
# [WRITE]  Writing reproduction test...
# [FIX]    Generating fix...
# [SUBMIT] Submitting PR...
# [DONE]   Error fixed! PR: https://github.com/davidkimai/godel/pull/123
```

## Testing

```bash
# Run all autonomic tests
npm test -- --testPathPattern="autonomic"

# Run specific test file
npm test -- src/autonomic/__tests__/error-listener.test.ts
npm test -- src/autonomic/__tests__/orchestrator.test.ts
npm test -- src/autonomic/__tests__/patch-agent.test.ts
```

## Configuration

The orchestrator can be configured with:

```typescript
orchestrator.configure({
  pollIntervalMs: 5000,     // How often to check for errors
  maxConcurrentJobs: 3,     // Maximum parallel fixes
  autoProcess: true,        // Automatically process errors
});
```

## API

### Creating the Autonomic Swarm

```typescript
import { createAutonomicSwarm } from './autonomic';
import { getGlobalEventBus } from './core/event-bus';

const eventBus = getGlobalEventBus();
const orchestrator = await createAutonomicSwarm(eventBus);
```

### Manual Error Processing

```typescript
// Process specific error
await orchestrator.processError('error-id');

// Get status
const status = orchestrator.getStatus();

// Get jobs
const jobs = orchestrator.getJobs();
```

## Error Event Format

```typescript
interface ErrorEvent {
  id: string;
  timestamp: number;
  source: string;           // Component that errored
  errorType: string;        // Type of error
  message: string;          // Error message
  stackTrace?: string;      // Stack trace
  context: {
    sessionId?: string;
    taskId?: string;
    agentId?: string;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  reproducible: boolean;
}
```

## How It Works

1. **Detection**: Error Listener subscribes to the event bus and captures errors
2. **Assessment**: Errors are deduplicated and checked for auto-fixability
3. **Test Generation**: Test Writer creates a reproduction test using LLM
4. **Fix Generation**: Patch Agent generates a fix based on the error and test
5. **Verification**: The fix is tested against the reproduction test
6. **Submission**: PR Agent creates a pull request with the fix
7. **Tracking**: Error is marked as resolved with PR link

## Safety & Security

- **Reversible**: All changes are tested before submission
- **Minimal**: Only the necessary changes are made
- **Reviewable**: All fixes go through PR review process
- **Auditable**: Complete history of fixes and their outcomes

## Future Enhancements

- [ ] Machine learning for fix prediction
- [ ] Pattern recognition for common errors
- [ ] Integration with monitoring systems
- [ ] Automated rollback on PR merge issues
- [ ] Fix success rate analytics
- [ ] Cross-repository fix application
