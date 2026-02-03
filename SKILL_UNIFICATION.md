# Skill Registry Unification

## Overview

Dash now provides a **unified skill interface** that combines skills from two sources:

1. **ClawHub** - OpenClaw's official skill registry (https://clawhub.ai)
2. **Vercel Skills** - Vercel's skills.sh ecosystem (https://skills.sh) - npm-based

This unification allows users to search, install, and manage skills from both sources through a single interface.

## Architecture

```
src/
├── skills/
│   ├── index.ts           # Unified entry point & convenience API
│   ├── types.ts           # Shared type definitions
│   ├── registry.ts        # Unified registry (combines both sources)
│   ├── clawhub.ts         # ClawHub adapter (wraps existing client)
│   └── vercel.ts          # Vercel skills client (npm/skills.sh)
```

## Usage

### CLI Commands

```bash
# List all installed skills (both sources)
dash skills list

# Search across both sources
dash skills search postgres
dash skills search "machine learning" --limit 10
dash skills search web --sort downloads

# Install from either source (auto-detects)
dash skills install postgres-backup
dash skills install some-npm-skill

# Install from specific source
dash skills install clawhub:postgres-backup
dash skills install vercel:@vercel-labs/agent-skills

# Remove a skill
dash skills remove postgres-backup
dash skills remove postgres-backup --yes

# Update skills
dash skills update postgres-backup
dash skills update --all

# Get skill info
dash skills info postgres-backup
dash skills info postgres-backup --readme

# List available sources
dash skills sources
```

### Programmatic API

```typescript
import { skills, UnifiedSkillRegistry } from './skills';

// Search across all sources
const results = await skills.search({ 
  query: 'postgres', 
  limit: 10,
  sort: 'downloads'
});

// Install (auto-detects source)
await skills.install('postgres-backup');

// Install from specific source
await skills.install('clawhub:postgres-backup');
await skills.install('vercel:@vercel-labs/agent-skills');

// List installed
const installed = await skills.list();

// Remove
await skills.remove('postgres-backup');

// Get metadata
const info = await skills.info('postgres-backup');
```

## Skill ID Format

Skills can be referenced in two ways:

1. **Simple slug**: `postgres-backup` - Registry will search all enabled sources
2. **Source-qualified**: `clawhub:postgres-backup` or `vercel:some-package` - Explicit source

When using simple slugs:
- If only one source has the skill, it installs from that source
- If multiple sources have the skill, an error suggests using source-qualified format

## Source Details

### ClawHub

- **URL**: https://clawhub.ai
- **Type**: Native OpenClaw skill registry
- **Skills**: SKILL.md format, structured metadata
- **Authentication**: Optional token support
- **Lockfile**: `.clawhub-lockfile.json`

### Vercel Skills

- **URL**: https://skills.sh
- **Type**: npm-based packages
- **Skills**: AGENTS.md or SKILL.md in npm packages
- **Discovery**: npm registry search + skills.sh API (when available)
- **Lockfile**: `.vercel-lockfile.json`

## Configuration

Environment variables:

```bash
# ClawHub
CLAWHUB_REGISTRY=https://clawhub.ai
CLAWHUB_SITE=https://clawhub.ai
CLAWHUB_TOKEN=your_token_here

# Vercel Skills
VERCEL_SKILLS_REGISTRY=https://skills.sh
NPM_REGISTRY=https://registry.npmjs.org

# General
DASH_WORKDIR=/path/to/workdir
```

## Unified Lockfile

The unified registry maintains a combined lockfile at:
```
skills/.unified-lockfile.json
```

This tracks all installed skills regardless of source:

```json
{
  "version": "1.0",
  "lastSync": "2026-02-02T22:52:00Z",
  "skills": [
    {
      "id": "clawhub:postgres-backup",
      "source": "clawhub",
      "slug": "postgres-backup",
      "version": "1.2.0",
      "installedAt": "2026-02-02T22:00:00Z",
      "path": "/path/to/skills/clawhub/postgres-backup"
    },
    {
      "id": "vercel:@vercel-labs/agent-skills",
      "source": "vercel",
      "slug": "@vercel-labs/agent-skills",
      "version": "1.0.0",
      "installedAt": "2026-02-02T22:30:00Z",
      "path": "/path/to/skills/vercel/@vercel-labs/agent-skills"
    }
  ]
}
```

## Error Handling

### AmbiguousSkillError

When multiple sources have a skill with the same slug:

```
⚠️  Multiple sources have this skill:
   clawhub:my-skill, vercel:my-skill

   Specify source with:
   dash skills install clawhub:my-skill
   dash skills install vercel:my-skill
```

### SkillNotFoundError

When a skill doesn't exist in any source:

```
❌ Skill not found: my-skill

   Try searching first:
   dash skills search my-skill
```

### SourceNotAvailableError

When a specified source is disabled or unavailable:

```
❌ Source not available: vercel
```

## Implementation Notes

### Search Strategy

1. Queries are sent to all enabled sources in parallel
2. Results are combined and deduplicated
3. Default sort: ClawHub results first, then by relevance
4. Pagination is applied after merging

### Installation Strategy

1. Parse skill ID for source prefix
2. If source specified: install from that source
3. If no source: check all sources for the skill
4. If found in one: install from that source
5. If found in multiple: throw AmbiguousSkillError
6. If not found: throw SkillNotFoundError

### Caching

- Search results are cached for 5 minutes
- Cache key includes query parameters
- Cache is per-registry instance

## Future Enhancements

1. **More Sources**: Add support for additional skill registries
2. **Skill Sync**: Synchronize skills across multiple machines
3. **Version Constraints**: Support semver ranges in dependencies
4. **Skill Ratings**: Cross-source rating aggregation
5. **Skill Verification**: Cryptographic verification of skill integrity

## Migration from Old Commands

Old commands are still available but deprecated:

```bash
# Old (still works)
dash clawhub search postgres
dash clawhub install postgres-backup

# New (recommended)
dash skills search postgres
dash skills install postgres-backup
dash skills install clawhub:postgres-backup  # Explicit source
```
