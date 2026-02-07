# CI/CD Integration Example

This example demonstrates integrating Godel into CI/CD pipelines.

## Overview

Godel can enhance CI/CD with:
- Automated code review
- Test generation and execution
- Documentation updates
- Security scanning
- Deployment orchestration

## GitHub Actions

### 1. Basic Workflow

```yaml
# .github/workflows/godel.yml
name: Godel CI

on: [push, pull_request]

jobs:
  godel-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Godel
        uses: godel/setup-action@v1
        with:
          api-key: ${{ secrets.GODEL_API_KEY }}
          server: ${{ secrets.GODEL_SERVER }}
      
      - name: Code Review
        run: godel do "Review this PR for issues"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 2. Comprehensive Pipeline

```yaml
# .github/workflows/comprehensive.yml
name: Godel Comprehensive CI

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Godel
        uses: godel/setup-action@v1
        with:
          api-key: ${{ secrets.GODEL_API_KEY }}
      
      - name: Get changed files
        id: changed
        run: |
          echo "files=$(git diff --name-only HEAD^ HEAD | tr '\n' ' ')" >> $GITHUB_OUTPUT
      
      - name: Analyze Changes
        run: |
          godel do "Analyze changes in ${{ steps.changed.outputs.files }} for impact"

  review:
    needs: analyze
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Godel
        uses: godel/setup-action@v1
        with:
          api-key: ${{ secrets.GODEL_API_KEY }}
      
      - name: Code Review
        run: |
          godel review \
            --pr ${{ github.event.pull_request.number }} \
            --comment-on-pr \
            --check-security \
            --check-performance

  test:
    needs: review
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Godel
        uses: godel/setup-action@v1
      
      - name: Generate Tests
        run: |
          godel do "Generate unit tests for modified files"
      
      - name: Run Tests
        run: |
          godel test run --coverage --report

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Security Scan
        run: |
          godel security scan --report-format sarif
      
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: godel-security-report.sarif
```

### 3. Auto-Merge Workflow

```yaml
# .github/workflows/auto-merge.yml
name: Godel Auto-Merge

on:
  pull_request:
    types: [labeled]

jobs:
  auto-merge:
    if: contains(github.event.pull_request.labels.*.name, 'godel-approved')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Godel
        uses: godel/setup-action@v1
      
      - name: Final Review
        run: |
          godel do "Final verification before merge" \
            --strategy careful \
            --timeout 10
      
      - name: Merge PR
        uses: pascalgn/automerge-action@v0.15.6
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - review
  - test
  - security
  - deploy

godel:review:
  stage: review
  image: node:20
  script:
    - npm install -g @jtan15010/godel
    - godel do "Review merge request for code quality"
  only:
    - merge_requests

godel:test:
  stage: test
  image: node:20
  script:
    - godel test generate --for-changes
    - godel test run --coverage
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

godel:security:
  stage: security
  image: node:20
  script:
    - godel security scan --format gitlab
  artifacts:
    reports:
      sast: gl-security-report.json
```

## CircleCI

```yaml
# .circleci/config.yml
version: 2.1

orbs:
  godel: godel/godel@1.0

jobs:
  review:
    docker:
      - image: cimg/node:20.0
    steps:
      - checkout
      - godel/setup
      - run:
          name: Code Review
          command: godel do "Review this commit"

  test:
    docker:
      - image: cimg/node:20.0
    steps:
      - checkout
      - godel/setup
      - run:
          name: Generate and Run Tests
          command: |
            godel test generate
            godel test run

workflows:
  godel-ci:
    jobs:
      - review
      - test:
          requires:
            - review
```

## SDK Integration

```typescript
// scripts/ci-pipeline.ts
import { GodelClient } from '@jtan15010/godel';

const client = new GodelClient({
  baseUrl: process.env.GODEL_SERVER,
  apiKey: process.env.GODEL_API_KEY
});

async function runPipeline() {
  // 1. Analyze changes
  const analysis = await client.intent.execute({
    description: `Analyze changes in ${process.env.CHANGED_FILES}`,
    constraints: { timeout: 5 }
  });

  // 2. Code review
  const review = await client.skills.invoke('code-review', {
    target: '.',
    focus: ['security', 'performance']
  });

  if (review.output.issues.length > 0) {
    console.log('Issues found:', review.output.issues);
    process.exit(1);
  }

  // 3. Generate tests
  await client.intent.execute({
    description: 'Generate tests for modified files',
    constraints: { timeout: 10 }
  });

  // 4. Security scan
  const scan = await client.security.scan({
    rules: ['secrets', 'vulnerabilities']
  });

  if (scan.issues.some(i => i.severity === 'critical')) {
    console.log('Critical security issues found!');
    process.exit(1);
  }

  console.log('✓ Pipeline completed successfully');
}

runPipeline();
```

## Deployment Integration

```typescript
// scripts/deploy.ts
import { GodelClient } from '@jtan15010/godel';

const client = new GodelClient({
  baseUrl: process.env.GODEL_SERVER,
  apiKey: process.env.GODEL_API_KEY
});

async function deploy() {
  // Pre-deployment checks
  await client.intent.execute({
    description: `
      Pre-deployment verification:
      1. Run all tests
      2. Check for breaking changes
      3. Verify environment variables
      4. Validate configuration
    `,
    constraints: { strategy: 'careful', timeout: 15 }
  });

  // Execute deployment
  const deployment = await client.skills.invoke('deployment', {
    environment: process.env.DEPLOY_ENV,
    dryRun: process.env.DRY_RUN === 'true'
  });

  if (!deployment.success) {
    console.error('Deployment failed:', deployment.output.error);
    process.exit(1);
  }

  // Post-deployment verification
  await client.intent.execute({
    description: 'Verify deployment health and run smoke tests',
    constraints: { timeout: 10 }
  });

  console.log('✓ Deployment successful');
}

deploy();
```

## Best Practices

1. **Use dedicated API keys** for CI/CD
2. **Set timeouts** to prevent hanging builds
3. **Cache dependencies** between runs
4. **Report results** back to PR/MR
5. **Fail fast** on critical issues
6. **Parallelize** independent checks
