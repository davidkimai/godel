# CI/CD Integration Examples

Integrate Godel into your CI/CD pipelines with GitHub Actions, GitLab CI, and other platforms.

## Overview

This example shows how to integrate Godel agent orchestration into your continuous integration and deployment workflows.

## Files

- `.github/workflows/godel-ci.yml` - GitHub Actions workflow
- `.gitlab-ci.yml` - GitLab CI configuration
- `jenkins/Jenkinsfile` - Jenkins pipeline
- `azure-pipelines.yml` - Azure DevOps pipeline
- `drone.yml` - Drone CI configuration
- `scripts/` - Helper scripts for CI/CD

## GitHub Actions

### Basic Setup

Create `.github/workflows/godel-ci.yml`:

```yaml
name: Godel CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  code-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Godel
        uses: godel-ai/setup-godel@v1
        with:
          version: '2.0.0'
          api-key: ${{ secrets.GODEL_API_KEY }}

      - name: Create Review Swarm
        run: |
          godel swarm create \
            --name "pr-review-${{ github.event.pull_request.number }}" \
            --task "Review PR changes for bugs, security issues, and best practices" \
            --initial-agents 3 \
            --strategy parallel

      - name: Wait for Completion
        run: |
          # Wait for swarm to complete (with timeout)
          timeout 300 godel swarm wait "pr-review-${{ github.event.pull_request.number }}" || true

      - name: Generate Report
        run: |
          godel swarm report "pr-review-${{ github.event.pull_request.number }}" --format markdown > review-report.md

      - name: Comment PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('review-report.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: report
            });
```

### Advanced Workflow with Workflow Engine

```yaml
name: Godel Advanced CI

on:
  push:
    branches: [main]

jobs:
  full-pipeline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Godel
        uses: godel-ai/setup-godel@v1
        with:
          version: '2.0.0'

      - name: Run CI Workflow
        run: godel workflow run .godel/workflows/ci-pipeline.yaml
        env:
          GODEL_API_KEY: ${{ secrets.GODEL_API_KEY }}
          GIT_REF: ${{ github.sha }}

      - name: Upload Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-artifacts
          path: dist/
```

### Security Scanning Workflow

```yaml
name: Security Scan

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly
  workflow_dispatch:

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Godel
        uses: godel-ai/setup-godel@v1

      - name: Create Security Swarm
        run: |
          godel swarm create \
            --name "security-scan-${{ github.run_id }}" \
            --task "Perform comprehensive security audit: check for vulnerabilities, secrets, and compliance issues" \
            --initial-agents 5 \
            --budget 25.00

      - name: Check Results
        run: |
          if godel swarm has-issues "security-scan-${{ github.run_id }}"; then
            echo "::error::Security issues found!"
            exit 1
          fi
```

## GitLab CI

Create `.gitlab-ci.yml`:

```yaml
stages:
  - review
  - test
  - deploy

variables:
  GODEL_API_KEY: $GODEL_API_KEY

.godel_setup: &godel_setup
  - apk add --no-cache curl
  - curl -sSL https://get.godel-ai.io | sh

code_review:
  stage: review
  image: alpine:latest
  before_script:
    - *godel_setup
  script:
    - godel swarm create
        --name "review-$CI_MERGE_REQUEST_IID"
        --task "Review merge request changes"
        --initial-agents 3
    - godel swarm wait "review-$CI_MERGE_REQUEST_IID"
    - godel swarm report "review-$CI_MERGE_REQUEST_IID" --format markdown > review.md
  artifacts:
    reports:
      dotenv: review.md
  only:
    - merge_requests

automated_tests:
  stage: test
  image: node:20
  before_script:
    - *godel_setup
  script:
    - godel workflow run .godel/workflows/test-pipeline.yaml
  artifacts:
    reports:
      junit: test-results.xml
```

## Jenkins

Create `Jenkinsfile`:

```groovy
pipeline {
    agent any

    environment {
        GODEL_API_KEY = credentials('godel-api-key')
    }

    stages {
        stage('Code Review') {
            when {
                changeRequest()
            }
            steps {
                sh '''
                    godel swarm create \
                        --name "jenkins-review-${CHANGE_ID}" \
                        --task "Review pull request ${CHANGE_ID}" \
                        --initial-agents 3
                    
                    godel swarm wait "jenkins-review-${CHANGE_ID}"
                '''
            }
        }

        stage('Build & Test') {
            steps {
                sh 'godel workflow run .godel/workflows/build-test.yaml'
            }
        }

        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                sh 'godel workflow run .godel/workflows/deploy.yaml --var environment=production'
            }
        }
    }

    post {
        always {
            sh 'godel logs export --since 1h > build-logs.json'
            archiveArtifacts artifacts: 'build-logs.json'
        }
    }
}
```

## Azure DevOps

Create `azure-pipelines.yml`:

```yaml
trigger:
  - main

pr:
  - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: UseNode@2
    inputs:
      versionSpec: '20.x'

  - script: |
      npm install -g @jtan15010/godel
    displayName: 'Install Godel'

  - script: |
      godel swarm create \
        --name "azdo-review-$(Build.BuildId)" \
        --task "Review build $(Build.BuildId)" \
        --initial-agents 3
    displayName: 'Create Review Swarm'
    env:
      GODEL_API_KEY: $(GODEL_API_KEY)

  - script: |
      godel swarm wait "azdo-review-$(Build.BuildId)"
      godel swarm report "azdo-review-$(Build.BuildId)" > $(Build.ArtifactStagingDirectory)/review-report.md
    displayName: 'Wait and Generate Report'

  - task: PublishBuildArtifacts@1
    inputs:
      pathToPublish: '$(Build.ArtifactStagingDirectory)'
      artifactName: 'review-report'
```

## Best Practices

### 1. Use Workflow Files

Define your CI/CD logic in reusable workflow files:

```yaml
# .godel/workflows/ci-pipeline.yaml
name: ci-pipeline
variables:
  nodeVersion: '20'
  testTimeout: 300000

steps:
  - id: lint
    name: Lint Code
    agent: node-agent
    task: Run ESLint and Prettier checks

  - id: test
    name: Run Tests
    agent: node-agent
    task: Run test suite with coverage
    dependsOn: [lint]

  - id: build
    name: Build Project
    agent: node-agent
    task: Build production bundle
    dependsOn: [test]

  - id: security-scan
    name: Security Scan
    agent: security-agent
    task: Scan for vulnerabilities
    dependsOn: [build]
    parallel: true

  - id: deploy-staging
    name: Deploy to Staging
    agent: deploy-agent
    task: Deploy to staging environment
    dependsOn: [security-scan]
```

### 2. Budget Control

Set budgets to control costs:

```yaml
- name: Setup Godel
  uses: godel-ai/setup-godel@v1
  with:
    budget-limit: 50.00
    budget-warning: 75
    budget-critical: 90
```

### 3. Timeouts

Always set timeouts to prevent runaway jobs:

```yaml
- name: Run Godel Workflow
  run: timeout 600 godel workflow run ci.yaml
```

### 4. Artifact Collection

Collect logs and reports for debugging:

```yaml
- name: Collect Artifacts
  if: always()
  run: |
    godel logs export --since 1h > logs.json
    godel swarm report <swarm-id> > report.md

- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: godel-artifacts
    path: |
      logs.json
      report.md
```

### 5. Conditional Execution

Only run Godel for relevant changes:

```yaml
on:
  pull_request:
    paths:
      - 'src/**'
      - 'tests/**'
```

## Scripts

### Wait for Swarm Completion

```bash
#!/bin/bash
# scripts/wait-for-swarm.sh

SWARM_ID=$1
TIMEOUT=${2:-300}

start_time=$(date +%s)

while true; do
  status=$(godel swarm status "$SWARM_ID" --format json | jq -r '.status')
  
  if [ "$status" = "completed" ]; then
    echo "Swarm completed successfully"
    exit 0
  fi
  
  if [ "$status" = "failed" ]; then
    echo "Swarm failed"
    exit 1
  fi
  
  current_time=$(date +%s)
  elapsed=$((current_time - start_time))
  
  if [ $elapsed -gt $TIMEOUT ]; then
    echo "Timeout waiting for swarm"
    exit 1
  fi
  
  sleep 5
done
```

### Generate PR Comment

```bash
#!/bin/bash
# scripts/generate-comment.sh

SWARM_ID=$1
OUTPUT_FILE=${2:-comment.md}

cat > "$OUTPUT_FILE" << EOF
## 🤖 Godel Agent Review

$(godel swarm report "$SWARM_ID" --format markdown)

---
*Generated by Godel Agent Orchestration*
EOF
```

## Troubleshooting

### API Key Issues

```bash
# Verify API key is set
echo $GODEL_API_KEY

# Test connection
godel status
```

### Swarm Creation Failed

```bash
# Check logs
godel logs tail

# Verify configuration
godel config validate
```

### Timeouts

Increase timeout for large repositories:

```yaml
- name: Run Review
  run: timeout 1800 godel swarm wait <swarm-id>
```

## Next Steps

- Learn about [Workflow DAGs](../workflow-dag/)
- Build [Custom Agents](../custom-agent/)
- Explore [Webhooks](../webhook-integration/)
