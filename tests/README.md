# Godel Test Suite

Comprehensive test coverage for all Godel components.

## Quick Start

```bash
# Run all tests
npm test

# Run specific test suite
npm run test:events    # EventBus tests
npm run test:cli       # CLI tests
npm run test:api        # API tests
npm run test:core       # Core service tests
npm run test:coverage   # With coverage report
```

## Test Structure

```
tests/
├── COVERAGE.md          # Coverage report and summary
├── README.md            # This file
├── run-tests.sh         # Bash test runner
├── events/
│   └── eventbus.test.js    # 20 EventBus tests
├── cli/
│   └── cli.test.js          # 25 CLI tests
├── api/
│   └── api.test.js          # 20 API tests
├── core/
│   └── core.test.js         # Core service tests
└── integration/
    └── integration.test.js  # Integration tests
```

## Test Categories

### EventBus Tests (`tests/events/`)

Tests the event bus system including:
- Event emission and subscription
- Event filtering and routing
- Middleware support
- Metrics and tracking
- Error handling
- Dead letter queue

Run: `node tests/events/eventbus.test.js`

### CLI Tests (`tests/cli/`)

Tests the command-line interface including:
- Version and help commands
- All subcommands (agent, swarm, workflow, status, config, init)
- Option parsing and validation
- Error handling
- Concurrent execution

Run: `node tests/cli/cli.test.js`

### API Tests (`tests/api/`)

Tests the REST API including:
- Health endpoints
- CRUD operations
- Authentication
- Error responses
- Performance

Run: `node tests/api/api.test.js`

### Core Service Tests (`tests/core/`)

Tests core services including:
- EventBus (comprehensive)
- ContextManager
- SafetyManager
- QualityController

Run: `node tests/core/core.test.js`

## Writing Tests

### JavaScript/TypeScript Tests

```javascript
import { EventBus, EventType } from '../src/events/index.js';

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error) {
    console.log(`❌ ${name}: ${error}`);
    return false;
  }
}

test('EventBus should be instantiable', () => {
  const bus = new EventBus();
  if (!bus) throw new Error('Bus not created');
});
```

### Test Utilities

```javascript
// Async test
async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error) {
    console.log(`❌ ${name}: ${error}`);
    return false;
  }
}

// HTTP request helper
async function httpRequest(method, path, body) {
  // Implementation...
}
```

## CI/CD Integration

Tests run automatically in CI:

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm test
```

## Test Coverage Goals

| Category | Current | Target |
|----------|---------|--------|
| Unit Tests | ~90 | 100% |
| Integration Tests | 0 | 80% |
| Code Coverage | 0% | 70% |
| Performance Tests | 0 | 20 |

## Test Data

Test fixtures are located in `tests/fixtures/`:
- `agents.json` - Sample agent data
- `swarms.json` - Sample swarm data
- `workflows.json` - Sample workflow data
- `config.yaml` - Sample configuration

## Performance Testing

```bash
# Run performance benchmarks
npm run test:perf

# Run load tests
npm run test:load
```

## Debugging Tests

```bash
# Run single test file with verbose output
node --inspect tests/events/eventbus.test.js

# Run with debug logging
DEBUG=test* node tests/cli/cli.test.js
```

## Continuous Improvement

- Add tests for new features
- Increase coverage monthly
- Review test quality in code reviews
- Automate performance regression detection
