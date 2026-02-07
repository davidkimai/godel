# Contributing Guide

How to contribute to Godel - setup, coding standards, testing, and PR process.

## Table of Contents

1. [Development Setup](#development-setup)
2. [Code Style](#code-style)
3. [Testing](#testing)
4. [PR Process](#pr-process)

---

## Development Setup

### Prerequisites

- Node.js 18+ with npm
- Git 2.35+
- Docker and Docker Compose (optional, for integration tests)

### Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/godel.git
cd godel

# Add upstream remote
git remote add upstream https://github.com/davidkimai/godel.git
```

### Install Dependencies

```bash
# Install all dependencies
npm install

# Build TypeScript
npm run build

# Verify setup
npm test
```

### Development Workflow

```bash
# Create a feature branch
git checkout -b feature/my-feature

# Make changes
# ...

# Run tests
npm test

# Run linting
npm run lint

# Run type checking
npm run typecheck

# Commit changes
git add .
git commit -m "feat: add my feature"

# Push to your fork
git push origin feature/my-feature

# Create Pull Request on GitHub
```

### Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit with your settings
# At minimum, set GODEL_API_KEY and database configuration

# For development, you may want:
GODEL_LOG_LEVEL=debug
GODEL_DRY_RUN=false
```

### Running Locally

```bash
# Start development mode (with hot reload)
npm run dev

# Or run specific commands:
npm run build
node dist/src/index.js agents spawn "test task"

# Or build and run
npm run build
node dist/index.js agents spawn "test task"
```

### Database Setup (Optional)

```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Run migrations
npm run migrate

# Check migration status
npm run migrate:status
```

### IDE Setup

#### VS Code

Recommended extensions:
- ESLint
- Prettier
- TypeScript Importer
- GitLens

Settings:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

---

## Code Style

### TypeScript Style Guide

We follow the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) with some modifications.

#### Naming Conventions

```typescript
// Classes: PascalCase
class AgentManager { }
class WorkflowEngine { }

// Interfaces: PascalCase with I prefix (optional)
interface IAgentConfig { }
interface AgentConfig { }  // Also acceptable

// Types: PascalCase
type AgentStatus = 'running' | 'paused' | 'completed';

// Enums: PascalCase, members UPPER_SNAKE_CASE
enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

// Functions: camelCase
function spawnAgent(task: string): Promise<Agent> { }

// Variables: camelCase
const agentCount = 5;
let currentStatus: AgentStatus;

// Constants: UPPER_SNAKE_CASE
const MAX_SWARMS = 10;
const DEFAULT_TIMEOUT = 30000;

// Private members: _camelCase or #camelCase
class MyClass {
  private _internalState: string;
  #privateField: number;
}
```

#### File Organization

```typescript
// 1. Imports (external first, then internal)
import { EventEmitter } from 'events';
import { z } from 'zod';

import { Agent } from './agent';
import { Logger } from '../utils/logger';

// 2. Type definitions
interface Config {
  name: string;
  timeout: number;
}

// 3. Constants
const DEFAULT_CONFIG: Config = {
  name: 'default',
  timeout: 30000,
};

// 4. Class/Function definition
export class Service {
  // ...
}

// 5. Utility functions (if not exported)
function helper() { }
```

#### Code Patterns

```typescript
// Prefer async/await over callbacks
// Good
async function fetchData(): Promise<Data> {
  const response = await fetch('/api/data');
  return response.json();
}

// Avoid
function fetchData(callback: (err: Error | null, data?: Data) => void) {
  fetch('/api/data')
    .then(res => res.json())
    .then(data => callback(null, data))
    .catch(err => callback(err));
}

// Use strict equality
// Good
if (status === 'running') { }

// Avoid
if (status == 'running') { }

// Null checks
// Good
if (value !== null && value !== undefined) { }
if (value != null) { }  // Also acceptable

// Avoid
if (value) { }  // Too broad, catches '', 0, false
```

### Linting

We use ESLint with TypeScript support:

```bash
# Run linter
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

ESLint configuration is in `.eslintrc.js`:

```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // Custom rules
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'warn',
  },
};
```

### Formatting

We use Prettier for code formatting:

```bash
# Format all files
npx prettier --write "src/**/*.ts"

# Check formatting
npx prettier --check "src/**/*.ts"
```

Prettier configuration is in `.prettierrc`:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

### Documentation

```typescript
/**
 * Brief description of the function.
 *
 * Longer description if needed, explaining the
 * purpose, behavior, and any important details.
 *
 * @param param1 - Description of first parameter
 * @param param2 - Description of second parameter
 * @returns Description of return value
 * @throws {ErrorType} When and why this error is thrown
 *
 * @example
 * ```typescript
 * const result = myFunction('value', 42);
 * console.log(result);
 * ```
 */
function myFunction(param1: string, param2: number): boolean {
  return true;
}
```

---

## Testing

### Test Structure

```
tests/
├── unit/              # Unit tests
│   ├── commands/
│   ├── core/
│   └── utils/
├── integration/       # Integration tests
│   ├── database/
│   ├── api/
│   └── workflow/
├── performance/       # Performance benchmarks
│   └── benchmark.ts
└── e2e/              # End-to-end tests
    └── cli.test.ts
```

### Writing Tests

```typescript
// tests/unit/core/agent.test.ts
import { AgentManager } from '../../../src/core/agent-manager';

describe('AgentManager', () => {
  let manager: AgentManager;

  beforeEach(() => {
    manager = new AgentManager();
  });

  afterEach(async () => {
    await manager.cleanup();
  });

  describe('spawn', () => {
    it('should spawn an agent with valid task', async () => {
      const agent = await manager.spawn('test task');
      
      expect(agent).toBeDefined();
      expect(agent.id).toMatch(/^agent-/);
      expect(agent.status).toBe('running');
    });

    it('should throw error for empty task', async () => {
      await expect(manager.spawn('')).rejects.toThrow('Task is required');
    });
  });

  describe('pause/resume', () => {
    it('should pause running agent', async () => {
      const agent = await manager.spawn('test task');
      
      await manager.pause(agent.id);
      
      const status = await manager.getStatus(agent.id);
      expect(status).toBe('paused');
    });
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- agent.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="spawn"

# Watch mode
npm run test:watch

# Run integration tests only
npm run test:integration:db
```

### Test Coverage

We aim for:
- **Unit tests**: > 80% coverage
- **Integration tests**: Cover critical paths
- **E2E tests**: Cover main user workflows

Coverage report:
```bash
npm test -- --coverage
# Open coverage/lcov-report/index.html
```

### Performance Tests

```bash
# Run performance benchmarks
npm run test:performance

# Run specific scenario
npm run test:perf:baseline
npm run test:perf:standard
npm run test:perf:full
```

### Mocking

```typescript
// Mock external services
jest.mock('../../src/utils/api', () => ({
  fetchData: jest.fn().mockResolvedValue({ data: 'mocked' }),
}));

// Mock with module factory
jest.mock('redis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue('value'),
    set: jest.fn().mockResolvedValue('OK'),
  }));
});
```

---

## PR Process

### Before Creating a PR

```bash
# 1. Update your branch
git checkout main
git pull upstream main
git checkout feature/my-feature
git rebase main

# 2. Run quality checks
npm run quality  # Runs lint + typecheck + test

# 3. Update documentation if needed
# - README.md for user-facing changes
# - docs/ for feature documentation
# - CHANGELOG.md for release notes

# 4. Commit with conventional commits
git commit -m "feat: add new feature"
```

### Conventional Commits

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): subject

body (optional)

footer (optional)
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test changes
- `chore`: Build/tooling changes

Examples:
```bash
git commit -m "feat(agent): add support for custom models"
git commit -m "fix(team): resolve race condition in agent spawning"
git commit -m "docs: update API reference"
git commit -m "refactor(workflow): simplify DAG execution logic"
```

### PR Template

```markdown
## Description
Brief description of the changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing performed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests pass locally
```

### Review Process

1. **Automated Checks**
   - CI must pass (tests, linting, type checking)
   - Code coverage must not decrease
   - Security scan must pass

2. **Code Review**
   - At least one approval from maintainer
   - All comments resolved
   - No merge conflicts

3. **Merge**
   - Squash and merge for clean history
   - Delete branch after merge

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - run: npm ci
      
      - run: npm run lint
      
      - run: npm run typecheck
      
      - run: npm test -- --coverage
      
      - uses: codecov/codecov-action@v3
```

### Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create release PR
4. After merge, tag release:
   ```bash
   git tag -a v2.1.0 -m "Release v2.1.0"
   git push origin v2.1.0
   ```
5. GitHub Actions publishes to npm

---

## Additional Resources

- [Architecture Overview](ARCHITECTURE.md)
- [API Documentation](API.md)
- [CLI Reference](CLI.md)

---

Thank you for contributing to Godel! 🚀
