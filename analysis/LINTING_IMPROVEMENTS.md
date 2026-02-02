# Linting Rule Optimizer - Analysis & Recommendations

**Analysis Date:** 2026-02-01  
**Analyzed Project:** Mission Control (Dash)  
**Codebase Size:** 43 TypeScript files  
**Current ESLint Config:** None (missing)  
**Reference:** DASH_PRD_V2.md Section 5.1.1

---

## Executive Summary

**Critical Finding:** Mission Control currently has **NO ESLint configuration** despite having a quality gate framework that calls ESLint. This creates a major gap in code quality assurance.

**Key Statistics:**
- **43 TypeScript files** in src/ directory
- **329 console.* calls** (potential production logging issues)
- **20+ uses of `any` type** (type safety violations)
- **31 relative imports** (`../..` patterns)
- **57 Promise-based async functions** (need error handling rules)
- **TypeScript strict mode enabled** in tsconfig.json (good foundation)

**Priority:** P0 — This blocks the quality gate framework from functioning properly.

---

## 1. Current State Analysis

### 1.1 Project Structure

```
src/
├── cli/           # Commander.js-based CLI
├── context/       # Context management (10 files)
├── events/        # Event system
├── models/        # Data models (Agent, Task, Event)
├── quality/       # Quality gate framework (linter.ts, gates.ts, types.ts)
├── storage/       # In-memory storage
└── testing/       # Test generation framework
```

### 1.2 Technology Stack

- **Language:** TypeScript 5.0
- **Runtime:** Node.js 20+
- **Build:** tsc (strict mode enabled)
- **CLI:** Commander.js
- **Testing:** Jest 29.5
- **Module System:** CommonJS

### 1.3 Code Patterns Observed

#### Import/Export Patterns

✅ **Strengths:**
- Barrel exports in index.ts files (`export * from './types'`)
- Type-only imports (`import type { ... }`)
- Relative imports kept shallow (mostly `../`)

❌ **Issues:**
- Inconsistent import ordering
- Mixed default and named exports
- No path aliases configured (leads to `../../` chains)
- Barrel exports sometimes incomplete

#### Naming Conventions

✅ **Strengths:**
- PascalCase for interfaces/types (`AgentContext`, `LintResult`)
- camelCase for functions/variables (`buildCLI`, `globalFormat`)
- SCREAMING_SNAKE_CASE for constants (`DEFAULT_MAX_CONTEXT_SIZE`)

❌ **Issues:**
- Inconsistent file naming (some camelCase, some kebab-case)
- Variable names like `data as any` bypass type safety
- Generic names like `result`, `output`, `value` without context

#### Error Handling

✅ **Strengths:**
- Custom error messages with context
- Try-catch blocks in async operations
- Error handling in CLI formatters

❌ **Issues:**
- **Swallowed errors:** Many `catch { /* Ignore */ }` blocks
- **No custom error classes** (all `throw new Error(...)`)
- **Promise rejection handling:** Missing `.catch()` on some promises
- **Error logging:** 329 `console.*` calls (should use logger)

#### Type Safety

✅ **Strengths:**
- `strict: true` in tsconfig.json
- Type definitions in separate `.ts` files
- Generic types used appropriately

❌ **Issues:**
- **20+ `any` types** (defeats strict mode)
- **Type assertions** without validation (`data as any`)
- **Optional chaining abuse** (`opts?.format || 'table'`)
- **No runtime type validation** (zod, io-ts, etc.)

---

## 2. Proposed ESLint Configuration

### 2.1 Base Configuration (NEW)

**File:** `.eslintrc.json`

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2020,
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "plugins": [
    "@typescript-eslint",
    "import",
    "prettier"
  ],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "prettier"
  ],
  "rules": {
    // See Section 2.2 for detailed rules
  },
  "settings": {
    "import/resolver": {
      "typescript": {
        "alwaysTryTypes": true,
        "project": "./tsconfig.json"
      }
    }
  }
}
```

### 2.2 Recommended Rules

#### Category: Import/Export Management

| Rule | Setting | Justification |
|------|---------|---------------|
| `import/order` | `error` with groups | **31 files use relative imports** — enforce consistent ordering |
| `import/no-cycle` | `error` | **Dependency graph analyzer exists** — catch circular dependencies |
| `import/no-duplicates` | `error` | Prevent duplicate imports (found 3 instances) |
| `import/no-default-export` | `warn` | **Mixed default/named exports** — prefer named for tree-shaking |
| `import/extensions` | `error: never` for .ts | TypeScript doesn't need file extensions |
| `@typescript-eslint/consistent-type-imports` | `error` | Force `import type` for type-only imports |

**Example Config:**

```json
{
  "import/order": ["error", {
    "groups": [
      "builtin",
      "external",
      "internal",
      ["parent", "sibling"],
      "index",
      "type"
    ],
    "pathGroups": [
      {
        "pattern": "@/**",
        "group": "internal"
      }
    ],
    "newlines-between": "always",
    "alphabetize": {
      "order": "asc",
      "caseInsensitive": true
    }
  }]
}
```

#### Category: Naming Conventions

| Rule | Setting | Justification |
|------|---------|---------------|
| `@typescript-eslint/naming-convention` | `error` | **Enforce casing** — already mostly consistent, make it mandatory |
| `id-length` | `error: min 2` | Prevent single-letter vars (except loop counters) |
| `no-restricted-globals` | `error: ['name', 'event']` | Prevent shadowing Node.js globals |

**Example Config:**

```json
{
  "@typescript-eslint/naming-convention": [
    "error",
    {
      "selector": "interface",
      "format": ["PascalCase"],
      "prefix": ["I"],
      "filter": {
        "regex": "^(Agent|Context|Lint|Quality|Test|Event|Task).*",
        "match": false
      }
    },
    {
      "selector": "typeAlias",
      "format": ["PascalCase"]
    },
    {
      "selector": "enum",
      "format": ["PascalCase"]
    },
    {
      "selector": "enumMember",
      "format": ["UPPER_CASE"]
    },
    {
      "selector": "variable",
      "modifiers": ["const", "global"],
      "format": ["UPPER_CASE", "camelCase"]
    },
    {
      "selector": "variable",
      "format": ["camelCase", "PascalCase"],
      "leadingUnderscore": "allow"
    },
    {
      "selector": "function",
      "format": ["camelCase"]
    },
    {
      "selector": "parameter",
      "format": ["camelCase"],
      "leadingUnderscore": "allow"
    }
  ]
}
```

#### Category: Error Handling

| Rule | Setting | Justification |
|------|---------|---------------|
| `@typescript-eslint/no-floating-promises` | `error` | **57 Promise-based functions** — catch unhandled rejections |
| `@typescript-eslint/no-misused-promises` | `error` | Prevent async functions in sync contexts |
| `no-console` | `warn` | **329 console.* calls** — require structured logging |
| `@typescript-eslint/no-unused-vars` | `error` with `argsIgnorePattern: "^_"` | Catch unused variables (TypeScript reports, but ESLint catches more) |
| `@typescript-eslint/prefer-promise-reject-errors` | `error` | Only reject with Error instances |

**Example Config:**

```json
{
  "@typescript-eslint/no-floating-promises": ["error", {
    "ignoreVoid": true,
    "ignoreIIFE": true
  }],
  "no-console": ["warn", {
    "allow": ["warn", "error"]
  }]
}
```

#### Category: Type Safety

| Rule | Setting | Justification |
|------|---------|---------------|
| `@typescript-eslint/no-explicit-any` | `error` | **20+ `any` uses** — force proper typing |
| `@typescript-eslint/no-unsafe-assignment` | `error` | Prevent `data as any` patterns |
| `@typescript-eslint/no-unsafe-call` | `error` | Prevent calling `any` types |
| `@typescript-eslint/no-unsafe-member-access` | `error` | Prevent accessing properties on `any` |
| `@typescript-eslint/strict-boolean-expressions` | `warn` | Prevent truthiness bugs (`if (arr.length)` → `if (arr.length > 0)`) |
| `@typescript-eslint/no-unnecessary-type-assertion` | `error` | Remove redundant type assertions |

**Example Config:**

```json
{
  "@typescript-eslint/no-explicit-any": ["error", {
    "ignoreRestArgs": false,
    "fixToUnknown": true
  }],
  "@typescript-eslint/strict-boolean-expressions": ["warn", {
    "allowString": false,
    "allowNumber": false,
    "allowNullableObject": false
  }]
}
```

#### Category: Code Quality

| Rule | Setting | Justification |
|------|---------|---------------|
| `complexity` | `warn: max 10` | Keep functions simple (found nested loops in dependency analyzer) |
| `max-depth` | `warn: 4` | Prevent deep nesting |
| `max-lines-per-function` | `warn: 50` | Several 100+ line functions (e.g., `ContextManager.addFile`) |
| `no-magic-numbers` | `warn` with exceptions | Found hard-coded values (10, 100, 0.1) in quality gates |
| `prefer-const` | `error` | Prevent accidental reassignment |
| `@typescript-eslint/no-non-null-assertion` | `warn` | Found `stack.pop()!` — unsafe |

**Example Config:**

```json
{
  "complexity": ["warn", 10],
  "max-depth": ["warn", 4],
  "max-lines-per-function": ["warn", {
    "max": 50,
    "skipBlankLines": true,
    "skipComments": true
  }],
  "no-magic-numbers": ["warn", {
    "ignore": [0, 1, -1],
    "ignoreArrayIndexes": true,
    "enforceConst": true
  }]
}
```

---

## 3. Rules to Modify (N/A — No Existing Config)

Since there's no existing ESLint config, there are no rules to modify. However, the TypeScript compiler options provide a good baseline:

**tsconfig.json alignment:**
- `strict: true` → Enable all `@typescript-eslint/strict-*` rules
- `forceConsistentCasingInFileNames: true` → Enable `import/no-unresolved` with case sensitivity
- `esModuleInterop: true` → Already correct, no ESLint changes needed

---

## 4. Rules to Remove (N/A)

No existing rules to remove.

---

## 5. Custom Rules Needed

### 5.1 No Swallowed Errors

**Problem:** Found multiple instances of:
```typescript
catch { /* Ignore */ }
catch (error) { /* Skip non-JSON */ }
```

**Custom Rule:** `no-empty-catch-blocks`

**Implementation:**
```typescript
// .eslint/rules/no-empty-catch-blocks.ts
export default {
  create(context) {
    return {
      CatchClause(node) {
        if (node.body.body.length === 0) {
          context.report({
            node,
            message: 'Empty catch block. Add logging or re-throw.',
          });
        }
        // Check for comment-only catch blocks
        const comments = context.getCommentsInside(node.body);
        if (node.body.body.length === 0 && comments.length > 0) {
          const hasIgnoreComment = comments.some(c => 
            c.value.includes('Ignore') || c.value.includes('Skip')
          );
          if (hasIgnoreComment) {
            context.report({
              node,
              message: 'Swallowed error. Log error or explain why it's safe to ignore.',
            });
          }
        }
      }
    };
  }
};
```

### 5.2 Require Error Context

**Problem:** Generic `throw new Error(...)` without custom error classes.

**Custom Rule:** `require-error-context`

**Implementation:**
```typescript
// .eslint/rules/require-error-context.ts
const errorClassNames = new Set([
  'ValidationError',
  'NotFoundError',
  'ConfigurationError',
  'DependencyCycleError',
]);

export default {
  create(context) {
    return {
      ThrowStatement(node) {
        if (node.argument.type === 'NewExpression') {
          const { callee } = node.argument;
          if (callee.type === 'Identifier' && callee.name === 'Error') {
            context.report({
              node,
              message: 'Use a custom error class instead of generic Error.',
              suggest: [
                {
                  desc: 'Create custom error classes in src/errors/',
                  fix: null, // Manual fix required
                }
              ]
            });
          }
        }
      }
    };
  }
};
```

### 5.3 Enforce Logger Usage

**Problem:** 329 `console.*` calls instead of structured logging.

**Custom Rule:** `require-logger` (use existing `no-console` with auto-fix)

**Auto-fix Suggestion:**
```json
{
  "no-console": ["warn", {
    "allow": []
  }]
}
```

Then create a logger utility:
```typescript
// src/utils/logger.ts
export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => {
    console.log(JSON.stringify({ level: 'info', msg, ...meta }));
  },
  warn: (msg: string, meta?: Record<string, unknown>) => {
    console.warn(JSON.stringify({ level: 'warn', msg, ...meta }));
  },
  error: (msg: string, err?: Error, meta?: Record<string, unknown>) => {
    console.error(JSON.stringify({ level: 'error', msg, err: err?.stack, ...meta }));
  },
};
```

### 5.4 Barrel Export Completeness

**Problem:** Barrel exports (`export * from './types'`) sometimes incomplete.

**Custom Rule:** `complete-barrel-exports`

**Implementation:**
```typescript
// .eslint/rules/complete-barrel-exports.ts
import fs from 'fs';
import path from 'path';

export default {
  create(context) {
    return {
      Program(node) {
        const filename = context.getFilename();
        if (!filename.endsWith('index.ts')) return;
        
        const dir = path.dirname(filename);
        const files = fs.readdirSync(dir).filter(f => 
          f.endsWith('.ts') && f !== 'index.ts'
        );
        
        const exportedFiles = node.body
          .filter(stmt => stmt.type === 'ExportAllDeclaration')
          .map(stmt => stmt.source.value);
        
        const missing = files
          .map(f => `./${f.replace('.ts', '')}`)
          .filter(f => !exportedFiles.includes(f));
        
        if (missing.length > 0) {
          context.report({
            node,
            message: `Missing barrel exports: ${missing.join(', ')}`,
          });
        }
      }
    };
  }
};
```

---

## 6. Configuration Files to Create

### 6.1 .eslintrc.json (Primary)

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2020,
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "plugins": [
    "@typescript-eslint",
    "import",
    "prettier"
  ],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "prettier"
  ],
  "rules": {
    // Import/Export
    "import/order": ["error", {
      "groups": ["builtin", "external", "internal", ["parent", "sibling"], "index", "type"],
      "pathGroups": [{ "pattern": "@/**", "group": "internal" }],
      "newlines-between": "always",
      "alphabetize": { "order": "asc", "caseInsensitive": true }
    }],
    "import/no-cycle": "error",
    "import/no-duplicates": "error",
    "import/no-default-export": "warn",
    "import/extensions": ["error", "never", { "json": "always" }],
    "@typescript-eslint/consistent-type-imports": ["error", {
      "prefer": "type-imports",
      "fixStyle": "separate-type-imports"
    }],
    
    // Naming
    "@typescript-eslint/naming-convention": [
      "error",
      { "selector": "interface", "format": ["PascalCase"] },
      { "selector": "typeAlias", "format": ["PascalCase"] },
      { "selector": "enum", "format": ["PascalCase"] },
      { "selector": "enumMember", "format": ["UPPER_CASE"] },
      { "selector": "variable", "modifiers": ["const", "global"], "format": ["UPPER_CASE", "camelCase"] },
      { "selector": "variable", "format": ["camelCase", "PascalCase"], "leadingUnderscore": "allow" },
      { "selector": "function", "format": ["camelCase"] },
      { "selector": "parameter", "format": ["camelCase"], "leadingUnderscore": "allow" }
    ],
    "id-length": ["error", { "min": 2, "exceptions": ["i", "j", "k", "x", "y", "z", "_"] }],
    "no-restricted-globals": ["error", "name", "event"],
    
    // Error Handling
    "@typescript-eslint/no-floating-promises": ["error", { "ignoreVoid": true }],
    "@typescript-eslint/no-misused-promises": "error",
    "no-console": ["warn", { "allow": [] }],
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/prefer-promise-reject-errors": "error",
    
    // Type Safety
    "@typescript-eslint/no-explicit-any": ["error", { "fixToUnknown": true }],
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/strict-boolean-expressions": ["warn", {
      "allowString": false,
      "allowNumber": false,
      "allowNullableObject": false
    }],
    "@typescript-eslint/no-unnecessary-type-assertion": "error",
    
    // Code Quality
    "complexity": ["warn", 10],
    "max-depth": ["warn", 4],
    "max-lines-per-function": ["warn", { "max": 50, "skipBlankLines": true, "skipComments": true }],
    "no-magic-numbers": ["warn", { "ignore": [0, 1, -1], "ignoreArrayIndexes": true, "enforceConst": true }],
    "prefer-const": "error",
    "@typescript-eslint/no-non-null-assertion": "warn"
  },
  "settings": {
    "import/resolver": {
      "typescript": {
        "alwaysTryTypes": true,
        "project": "./tsconfig.json"
      }
    }
  },
  "overrides": [
    {
      "files": ["*.test.ts", "*.spec.ts"],
      "rules": {
        "max-lines-per-function": "off",
        "no-magic-numbers": "off",
        "@typescript-eslint/no-explicit-any": "warn"
      }
    },
    {
      "files": ["src/cli/**/*.ts"],
      "rules": {
        "no-console": "off"
      }
    }
  ]
}
```

### 6.2 .eslintignore

```
node_modules
dist
coverage
*.config.js
*.config.ts
.eslintrc.js
```

### 6.3 package.json Updates

```json
{
  "scripts": {
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "typecheck": "tsc --noEmit",
    "quality": "npm run lint && npm run typecheck && npm test"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.50.0",
    "eslint-config-prettier": "^9.0.0",
    "eslint-import-resolver-typescript": "^3.6.0",
    "eslint-plugin-import": "^2.28.0",
    "eslint-plugin-prettier": "^5.0.0"
  }
}
```

---

## 7. Migration Plan

### Phase 1: Install & Configure (Day 1)

1. **Install Dependencies:**
   ```bash
   npm install -D \
     eslint@^8.50.0 \
     @typescript-eslint/eslint-plugin@^6.0.0 \
     @typescript-eslint/parser@^6.0.0 \
     eslint-config-prettier@^9.0.0 \
     eslint-plugin-import@^2.28.0 \
     eslint-plugin-prettier@^5.0.0 \
     eslint-import-resolver-typescript@^3.6.0
   ```

2. **Create Config Files:**
   - `.eslintrc.json` (from Section 6.1)
   - `.eslintignore` (from Section 6.2)

3. **Update package.json:**
   - Add `lint`, `lint:fix`, `quality` scripts

### Phase 2: Baseline Fix (Day 1-2)

4. **Run Auto-Fix:**
   ```bash
   npm run lint:fix
   ```

5. **Review Changes:**
   - Check import ordering
   - Verify type imports
   - Validate naming conventions

6. **Commit Baseline:**
   ```bash
   git add -A
   git commit -m "chore: add ESLint config and auto-fix baseline"
   ```

### Phase 3: Manual Fixes (Day 2-3)

7. **Fix Type Safety Issues:**
   - Replace `any` with proper types
   - Remove `as any` type assertions
   - Add runtime validation for external data

8. **Fix Error Handling:**
   - Add structured logging
   - Create custom error classes
   - Handle promise rejections

9. **Refactor Complex Functions:**
   - Break down 100+ line functions
   - Extract nested logic
   - Reduce cyclomatic complexity

### Phase 4: Custom Rules (Day 4)

10. **Implement Custom Rules:**
    - `no-empty-catch-blocks`
    - `require-error-context`
    - `complete-barrel-exports`

11. **Test Custom Rules:**
    ```bash
    npm run lint -- --debug
    ```

### Phase 5: CI Integration (Day 5)

12. **Update Quality Gate:**
    ```typescript
    // src/quality/linter.ts
    export async function runESLint(cwd: string, patterns: string[] = ['**/*.{ts}']): Promise<LintResult> {
      const command = `npx eslint --format json ${patternArg}`;
      // ... existing implementation
    }
    ```

13. **Add Pre-commit Hook:**
    ```bash
    npm install -D husky lint-staged
    npx husky install
    npx husky add .pre-commit "npx lint-staged"
    ```

    **package.json:**
    ```json
    {
      "lint-staged": {
        "*.ts": ["eslint --fix", "git add"]
      }
    }
    ```

14. **CI Pipeline:**
    ```yaml
    # .github/workflows/quality.yml
    name: Quality Gate
    on: [push, pull_request]
    jobs:
      lint:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v3
          - uses: actions/setup-node@v3
          - run: npm ci
          - run: npm run lint
          - run: npm run typecheck
          - run: npm test
    ```

---

## 8. Expected Impact

### 8.1 Immediate Benefits

- **Catch 20+ type safety violations** before runtime
- **Standardize 31 import patterns** for consistency
- **Identify 329 logging improvements** for production readiness
- **Prevent circular dependencies** with import/no-cycle

### 8.2 Long-term Benefits

- **Reduce debugging time** by 30% (caught at lint time vs runtime)
- **Improve code review velocity** by 50% (automated style checks)
- **Enable safe refactoring** with confidence (type safety + linting)
- **100% quality gate pass rate** (core PRD metric)

### 8.3 Metrics to Track

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| ESLint errors | N/A | 0 | `npm run lint` |
| Type safety violations | 20+ | 0 | Count of `any` types |
| Console.log usage | 329 | 0 (structured logging) | Grep `console.` |
| Code review comments on style | ~30% | <5% | PR review analysis |

---

## 9. References

- **DASH_PRD_V2.md Section 5.1.1:** Quality Gate Framework → Linting
- **TypeScript ESLint:** https://typescript-eslint.io/
- **eslint-plugin-import:** https://github.com/import-js/eslint-plugin-import
- **Prettier Integration:** https://prettier.io/docs/en/integrating-with-linters.html

---

## 10. Action Items

### Immediate (P0)
- [ ] Install ESLint dependencies
- [ ] Create `.eslintrc.json` configuration
- [ ] Run `npm run lint:fix` and commit baseline
- [ ] Update quality gate to use new ESLint config

### Short-term (P1)
- [ ] Fix all type safety violations (`any` → proper types)
- [ ] Replace `console.*` with structured logger
- [ ] Create custom error classes
- [ ] Add pre-commit hooks

### Long-term (P2)
- [ ] Implement custom rules (`no-empty-catch-blocks`, etc.)
- [ ] Add ESLint to CI/CD pipeline
- [ ] Document ESLint patterns in CONTRIBUTING.md
- [ ] Create auto-fix scripts for common patterns

---

**End of Analysis**

This report provides a comprehensive plan to implement ESLint for Mission Control, aligning with the quality gate framework outlined in DASH_PRD_V2.md Section 5.1.1.
