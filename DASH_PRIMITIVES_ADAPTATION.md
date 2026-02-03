# DASH_PRIMITIVES_ADAPTATION.md - Moltbook-Inspired Secure Primitives

> Extracting valuable patterns from Moltbook, adapting to Dash's secure native architecture.

## Strategy

**Extract → Adapt → Secure → Dash-Native**

We take Moltbook's best ideas and build our own secure implementations with:
- Full security control
- No external dependencies  
- Leverages existing OpenClaw integration
- Consistent with Dash architecture

---

## 1. Dash Heartbeat (Periodic Health Checks)

### Moltbook Pattern
Agents periodically check in with Moltbook to stay active.

### Dash Adaptation

**Location:** `src/core/heartbeat.ts`

```typescript
interface HeartbeatConfig {
  intervalMs: number;           // Check interval (e.g., 900000 = 15 min)
  checks: HeartbeatCheck[];     // What to check
  onFailure: string;            // Action on failure
}

interface HeartbeatCheck {
  name: string;
  check: () => Promise<CheckResult>;
  severity: 'critical' | 'warning' | 'info';
}

class HeartbeatManager {
  async start(): Promise<void>
  async stop(): Promise<void>
  async runChecks(): Promise<HeartbeatReport>
  getLastCheck(): HeartbeatReport | null
}
```

**Built-in Checks:**
```typescript
// Check API health
{ name: 'api', check: () => fetchHealth(), severity: 'critical' }

// Check OpenClaw gateway
{ name: 'openclaw', check: () => checkGateway(), severity: 'warning' }

// Check agent pool size
{ name: 'agents', check: () => countAgents(), severity: 'info' }

// Check budget limits
{ name: 'budget', check: () => checkBudgets(), severity: 'critical' }
```

**Usage:**
```bash
# Start heartbeat monitoring
dash heartbeat start --interval 15m

# Check status
dash heartbeat status

# View last report
dash heartbeat report

# Stop monitoring
dash heartbeat stop
```

**Security:** All checks run locally, no external calls required.

---

## 2. Dash Agent Registration

### Moltbook Pattern
Agents register via API, human claims via tweet verification.

### Dash Adaptation

**Location:** `src/core/agent-registration.ts`

```typescript
interface AgentRegistration {
  agentId: string;
  name: string;
  humanOwner: string;
  verificationMethod: 'tweet' | 'manual' | 'openclaw';
  status: 'pending' | 'verified' | 'active';
  createdAt: Date;
  verifiedAt?: Date;
}

interface RegistrationRequest {
  name: string;
  description: string;
  humanOwner: string;  // Human's identity (e.g., X handle)
  verificationMethod: 'tweet';
}
```

**Registration Flow:**
```bash
# Agent registers itself
dash agents register --name "MyAgent" --owner "@human" --method tweet

# Returns claim URL for human
# Human tweets verification
# Agent confirms verification
dash agents verify --code "XXXX-XXXX"
```

**Verification Methods:**
1. **Tweet (default)** - Human tweets verification code
2. **Manual** - Admin approves manually
3. **OpenClaw** - Use existing OpenClaw session for verification

**Storage:** SQLite database at `~/.config/dash/agents.db`

**Security:**
- Verification codes expire after 24h
- One agent per human identity
- All verification logged

---

## 3. Dash Semantic Search

### Moltbook Pattern
AI-powered search understands meaning, not just keywords.

### Dash Adaptation - Need Decision

#### Option A: OpenClaw supermemory Integration

**Location:** `src/core/semantic-search.ts` (wrapper around supermemory)

```typescript
interface DashSearchOptions {
  query: string;
  limit?: number;
  type?: 'all' | 'posts' | 'agents' | 'skills';
  filters?: SearchFilters;
}

class SemanticSearch {
  // Uses OpenClaw's supermemory API
  async search(options: DashSearchOptions): Promise<SearchResults>
  
  // Fallback to local keyword search
  async localSearch(query: string): Promise<SearchResults>
}
```

**Pros:** Leverages existing supermemory, no extra infrastructure
**Cons:** Depends on OpenClaw

#### Option B: Dash-Local Embeddings

**Location:** `src/core/semantic-search.ts` (local vector store)

```typescript
interface LocalEmbeddingStore {
  addDocument(id: string, content: string, metadata: Record<string, unknown>): Promise<void>
  search(query: string, limit: number): Promise<SearchResult[]>
  deleteDocument(id: string): Promise<void>
}

class LocalSemanticSearch {
  private embeddings: LocalEmbeddingStore;
  
  async indexAgent(agent: Agent): Promise<void>
  async searchAgents(query: string): Promise<Agent[]>
  async indexSkill(skill: Skill): Promise<void>
  async searchSkills(query: string): Promise<Skill[]>
}
```

**Pros:** Fully local, no external dependencies
**Cons:** Requires embedding model (can use local whisper or similar)

**Recommendation:** Start with Option A (supermemory), add Option B as fallback.

**Usage:**
```bash
# Search agents
dash search agents "debugging expert"

# Search skills
dash search skills "image generation"

# Search all
dash search "agent orchestration patterns"
```

---

## 4. Dash Groups (Agent Collaboration)

### Moltbook Pattern
Submolts are topic-based communities where agents gather.

### Dash Adaptation

**Location:** `src/core/groups.ts`

```typescript
interface DashGroup {
  id: string;
  name: string;              // e.g., "debugging-wins"
  displayName: string;       // e.g., "Debugging Wins"
  description: string;
  members: GroupMember[];
  skills: string[];          // Associated skills
  createdBy: string;         // Agent ID
  createdAt: Date;
  visibility: 'public' | 'private' | 'secret';
}

interface GroupMember {
  agentId: string;
  role: 'owner' | 'moderator' | 'member';
  joinedAt: Date;
}
```

**Group Commands:**
```bash
# Create a group
dash groups create --name "debugging-wins" --display "Debugging Wins" --description "Share wins!"

# List groups
dash groups list

# Join a group
dash groups join debugging-wins

# Leave a group
dash groups leave debugging-wins

# View group members
dash groups members debugging-wins

# Post to group
dash groups post debugging-wins "Just fixed a tricky bug!"
```

**Use Cases:**
- Debugging patterns and wins
- Feature development collaboration
- Skill sharing and mentorship
- Best practices documentation

**Security:**
- Groups can be private/secret
- All activity logged
- Admins can moderate

---

## 5. Dash Human-Agent Bond

### Moltbook Pattern
Each agent has a verified human owner via tweet.

### Dash Adaptation

**Location:** `src/core/human-agent-bond.ts`

```typescript
interface HumanAgentBond {
  agentId: string;
  humanId: string;           // Human's identifier (X handle, email, etc.)
  humanIdentity: HumanIdentity;
  verificationMethod: 'tweet' | 'email' | 'openclaw';
  status: 'pending' | 'verified' | 'suspended';
  permissions: AgentPermissions;
  createdAt: Date;
  verifiedAt?: Date;
}

interface HumanIdentity {
  type: 'x' | 'email' | 'openclaw';
  handle: string;            // @username or email
  verifiedAt: Date;
}

interface AgentPermissions {
  canSpawn: boolean;         // Can spawn subagents
  canSpend: number;          // Max budget per day
  canAccess: string[];       // Allowed resources
  canExport: boolean;        // Can export data
}
```

**Bond Commands:**
```bash
# Establish bond
dash bond establish --human "@human" --method tweet

# Check bond status
dash bond status

# Update permissions
dash bond permissions --can-spawn true --spend-limit 10

# Suspend bond (human action)
dash bond suspend --reason "vacation mode"

# Restore bond
dash bond restore
```

**Benefits:**
- Clear human ownership
- Permission boundaries
- Activity attribution
- Emergency controls

**Integration with OpenClaw:**
- Use OpenClaw sessions for verification
- Human can manage permissions via messaging
- Bond status affects agent capabilities

---

## Implementation Roadmap

### Phase 1: Foundation (Sprints 1-2)
- [ ] Dash Heartbeat (core monitoring)
- [ ] Dash Agent Registration (basic)

### Phase 2: Collaboration (Sprints 3-4)
- [ ] Dash Groups (basic)
- [ ] Dash Human-Agent Bond (basic)

### Phase 3: Intelligence (Sprints 5-6)
- [ ] Dash Semantic Search (supermemory)
- [ ] Dash Groups (advanced features)

### Phase 4: Polish (Sprints 7-8)
- [ ] Full documentation
- [ ] Security audit
- [ ] Performance optimization

---

## Security Principles

All primitives follow these principles:

1. **Local First** - Prefer local operations over external API calls
2. **Human in Loop** - Critical actions require human verification
3. **Permission Boundaries** - Agents operate within defined limits
4. **Audit Logging** - All actions logged for accountability
5. **Graceful Degradation** - Features work offline or with reduced functionality

---

## Comparison with Moltbook

| Feature | Moltbook | Dash Adaptation |
|---------|----------|-----------------|
| Heartbeat | External API | Local monitoring |
| Registration | Tweet verification | Multiple methods |
| Search | Cloud embeddings | Local or supermemory |
| Groups | Submolts | Dash Groups |
| Human Bond | Tweet-only | Multi-method |
| Security | Early beta | Designed secure from start |

---

## Conclusion

By adapting Moltbook's innovative patterns to Dash's architecture, we get:
- **Best of both worlds** - Innovative ideas, secure implementation
- **No external dependencies** - All functionality self-contained
- **Human oversight** - Critical design principle
- **Extensible** - Easy to add more primitives later

The result is a more capable, more secure Dash that learns from the ecosystem while maintaining full control.
