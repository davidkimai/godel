# Dash + Pi-Mono Integration - Implementation Roadmap

**Objective:** Transform Dash into a pi-compatible orchestration platform that leverages pi-mono's powerful abstractions while maintaining Dash's swarm orchestration strengths.

**Target Compatibility:**
- ✅ Pi-mono (base toolkit)
- ✅ OpenClaw (built on pi-mono)
- ✅ Dash (orchestration layer on pi-mono)

---

## Architecture Vision

```
┌─────────────────────────────────────────────────────────────────┐
│                     DASH ORCHESTRATION LAYER                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Swarm Manager│  │  Dashboard   │  │   Budget Controller  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼─────────────────────┼──────────────┘
          │                 │                     │
┌─────────┼─────────────────┼─────────────────────┼──────────────┐
│         │      PI-MONO UNIFIED LLM API          │              │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌───────────┴──────────┐   │
│  │  Provider   │  │   Session   │  │    Extension API     │   │
│  │  Registry   │  │   Manager   │  │   (Plugins/Skills)   │   │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬──────────┘   │
└─────────┼────────────────┼─────────────────────┼──────────────┘
          │                │                     │
    ┌─────┴────┐     ┌─────┴────┐      ┌───────┴───────┐
    │ Anthropic│     │  OpenAI  │      │   Custom      │
    │ Claude   │     │   GPT    │      │  Providers    │
    └──────────┘     └──────────┘      └───────────────┘
```

---

## Phase 1: Foundation - Unified LLM API (Weeks 1-3)

### Goal
Create `@dash/ai` package that wraps pi-mono's unified LLM API with swarm-specific features.

### Key Deliverables
1. **Provider Abstraction Layer**
   - Wrap pi-mono's `packages/ai` with Dash-specific model resolution
   - Multi-provider swarm support (Claude + GPT agents in same swarm)
   - Automatic provider failover

2. **Swarm-Aware Model Registry**
   - Cost-optimized model selection per task type
   - Provider load balancing
   - Budget-aware model fallback

3. **Migration of Existing Code**
   - Refactor `src/core/llm.ts` to use unified API
   - Update `src/integrations/openclaw/` as adapter
   - Maintain backward compatibility

### Success Criteria
- [ ] Swarm can mix Claude and GPT agents
- [ ] Automatic failover when provider fails
- [ ] Cost tracking per provider
- [ ] 0 breaking changes to existing Dash API

---

## Phase 2: Extension System (Weeks 4-7)

### Goal
Implement pi-mono's extension architecture for custom swarm behaviors.

### Key Deliverables
1. **Extension API**
   - `registerTool()` - Custom agent tools
   - `registerCommand()` - CLI commands
   - `registerProvider()` - New LLM providers
   - `on()` - Event handlers

2. **Sandboxed Execution**
   - JIT TypeScript compilation (using `jiti`)
   - Permission system for extensions
   - Hot reloading

3. **Default Extensions**
   - Extract built-in tools to default extension
   - Create example extensions (Slack, Jira, custom deploy)

### Success Criteria
- [ ] Extensions can add custom tools
- [ ] Extensions can listen to swarm events
- [ ] Hot reload without restart
- [ ] Security sandbox prevents malicious code

---

## Phase 3: Session Tree + Event Architecture (Weeks 8-10)

### Goal
Implement tree-structured sessions and granular event streaming.

### Key Deliverables
1. **Tree-Structured Sessions**
   - JSONL storage with id/parentId
   - Branching and forking APIs
   - Tree navigation (`/tree` equivalent)

2. **Event Bus Architecture**
   - Granular events: `agent_start`, `tool_call`, `turn_end`, etc.
   - Real-time dashboard updates
   - Event persistence for replay

3. **Swarm Orchestration Using Trees**
   - A/B testing via branching
   - Exploration of multiple strategies
   - Recovery via tree navigation

### Success Criteria
- [ ] Can branch swarm at any decision point
- [ ] Can compare branch outcomes
- [ ] Dashboard shows real-time events
- [ ] Complete audit trail

---

## Phase 4: Skills System (Weeks 11-12)

### Goal
Implement Agent Skills standard for reusable capabilities.

### Key Deliverables
1. **Skill Loader**
   - Markdown skill parsing
   - Auto-loading based on context
   - Skill registry

2. **Skill Marketplace**
   - Built-in skills (deployment, testing, review)
   - Community skill sharing
   - Version management

3. **Integration with Swarms**
   - Skills shared across swarm agents
   - Skill-specific agent roles

### Success Criteria
- [ ] Skills auto-load based on task
- [ ] Community can create/share skills
- [ ] Skills work across all swarm agents

---

## Phase 5: Package Ecosystem (Ongoing)

### Goal
Enable community contributions via npm/git packages.

### Key Deliverables
1. **Package Manager**
   - `dash install npm:@company/dash-devops`
   - `dash install git:github.com/user/repo`
   - Version pinning and updates

2. **Package Registry** (Optional)
   - Curated packages
   - Search and discovery

3. **Documentation**
   - Package creation guide
   - Best practices
   - Examples

---

## Integration Strategy

### With Pi-Mono
```typescript
// Dash re-exports pi-mono's core
export { getModel, stream, complete } from '@mariozechner/pi-ai';
export { createAgentSession } from '@mariozechner/pi-agent';

// Dash adds orchestration layer
export { SwarmManager } from './swarm/manager';
export { SwarmOrchestrator } from './swarm/orchestrator';
```

### With OpenClaw
```typescript
// OpenClaw integration becomes adapter
export class OpenClawAdapter implements GatewayClient {
  constructor(private piClient: PiAgentClient) {}
  
  // Bridge OpenClaw protocol to pi-mono
}
```

### Backward Compatibility
- All existing Dash APIs maintained
- Gradual migration path
- Deprecation warnings for 2 versions

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Providers Supported | 1 (OpenClaw) | 15+ (via pi-mono) |
| Extension System | None | Full plugin architecture |
| Session Structure | Linear | Tree with branching |
| Event Granularity | Coarse | Fine-grained |
| Community Packages | 0 | 10+ (6 months) |
| Test Coverage | 100% | Maintain 100% |

---

## Risk Mitigation

### Risk: Breaking Changes
**Mitigation:** 
- Maintain backward compatibility layer
- Gradual migration with deprecation warnings
- Extensive test coverage

### Risk: Performance Degradation
**Mitigation:**
- Benchmark before/after each phase
- Optimize hot paths
- Lazy loading for extensions

### Risk: Complexity Increase
**Mitigation:**
- Clear documentation
- Examples for common patterns
- Sensible defaults

---

## Next Steps

1. **Create RFC for Phase 1** - Detailed design for Unified LLM API
2. **Set up monorepo structure** - Prepare for packages/ directory
3. **Begin Phase 1 implementation** - Start with provider abstraction
4. **Document as we go** - Keep docs in sync with code

---

**Timeline:** 12 weeks for MVP, additional 4 weeks for polish
**Team:** 2-3 senior engineers + community contributions
**Dependencies:** pi-mono packages (already available)
