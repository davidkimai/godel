# Spec-Driven Development (SDD) for Dash v2.0

This directory contains the specification system for Dash autonomous operations.

## Directory Structure

```
specs/
├── README.md              # This file
├── templates/             # Spec templates
│   ├── swarm-spec.yaml
│   ├── improvement-spec.yaml
│   └── validation-spec.yaml
├── active/                # Active specifications
│   ├── swarm-self-healing-v2.yaml
│   ├── context-optimization-v2.yaml
│   └── orchestrator-v4.yaml
└── archives/              # Historical specs
```

## Spec Format

All specs follow this YAML structure:

```yaml
spec:
  id: SPEC-001
  name: Feature Name
  version: 1.0.0
  status: draft | active | deprecated

requirements:
  - id: REQ-001
    description: Requirement description
    priority: P0 | P1 | P2
    test: command to verify

implementation:
  files: []

prompt_template: |
  You are building {{spec.name}}
  Requirements:
  {{spec.requirements}}

validation:
  command: npm test
  coverage_threshold: 80
```

## Usage

### Creating a New Spec

1. Copy a template from `specs/templates/`
2. Fill in the spec details
3. Save to `specs/active/` with name `feature-name-v1.yaml`
4. Register with spec-orchestrator.js

### Running Spec Orchestrator

```bash
node scripts/spec-orchestrator.js --list      # List all specs
node scripts/spec-orchestrator.js --validate  # Validate against specs
node scripts/spec-orchestrator.js --coverage  # Check spec coverage
```

## Spec Status Lifecycle

| Status | Meaning |
|--------|---------|
| draft | Being written, not yet active |
| active | In use by swarms and cron jobs |
| deprecated | Superseded, kept for history |

## Integration

- **Swarm Self-Healing**: Uses `specs/active/swarm-self-healing-v2.yaml`
- **Context Optimization**: Uses `specs/active/context-optimization-v2.yaml`
- **Orchestrator**: Uses `specs/active/orchestrator-v4.yaml`

## Examples

See `specs/active/` for complete examples of:
- Swarm self-healing specifications
- Context optimization specs
- Orchestration specs
