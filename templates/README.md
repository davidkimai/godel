# Godel Quick-Start Templates

Pre-configured templates for common Godel setups.

## Available Templates

### basic.yaml
Single worker agent - perfect for getting started quickly.

```bash
godel template apply quickstart/basic
```

### team.yaml
Complete team setup with coordinator and workers.

```bash
godel template apply quickstart/team
```

### development.yaml
Full development environment with CI/CD integration.

```bash
godel template apply quickstart/development
```

### enterprise.yaml
Production-ready enterprise configuration.

```bash
godel template apply quickstart/enterprise
```

## Template Structure

```yaml
name: template-name
description: What this template does

template:
  version: "1.0"
  
  # Infrastructure components
  infrastructure:
    monitoring: { enabled: true }
    
  # Team configuration
  team:
    name: my-team
    composition: {...}
    
  # Skills to install
  skills:
    install: [code-review, test-generation]
    
  # Configuration
  configuration:
    defaultModel: claude-sonnet-4-5
    
  # Post-setup commands
  postSetup:
    - echo "Setup complete"
```

## Creating Custom Templates

1. Copy an existing template
2. Modify the configuration
3. Save to `templates/custom/my-template.yaml`
4. Apply with `godel template apply custom/my-template`

## Template Variables

Use variables for dynamic values:

```yaml
team:
  name: ${TEAM_NAME:-default-team}
  workers: ${WORKER_COUNT:-3}
```

Pass variables via environment or CLI:

```bash
TEAM_NAME=backend-team godel template apply quickstart/team
godel template apply quickstart/team --var teamName=backend-team
```

## Best Practices

1. **Start with basic** for learning
2. **Use team** for production work
3. **Development** for CI/CD integration
4. **Enterprise** for compliance requirements

## Template Validation

Validate a template before applying:

```bash
godel template validate my-template.yaml
```

## Template Sharing

Share templates by committing to your repo:

```
.godel/templates/
  └── my-template.yaml
```

Or publish to the template registry:

```bash
godel template publish my-template
```
