# Pi-Mono Coding-Agent Pattern Analysis

> Deep analysis of extension system, skills system, and session management patterns from the pi-mono coding-agent package.
> 
> Source: https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent
> Analysis Date: 2026-02-03

---

## Table of Contents

1. [Extension System Analysis](#1-extension-system-analysis)
2. [Skills System Analysis](#2-skills-system-analysis)
3. [Session Management Analysis](#3-session-management-analysis)
4. [Mode Architecture](#4-mode-architecture)
5. [Integration Recommendations for Godel](#5-integration-recommendations-for-godel)

---

## 1. Extension System Analysis

### Overview

The extension system is a sophisticated plugin architecture that allows third-party code to:
- Subscribe to agent lifecycle events
- Register LLM-callable custom tools
- Register commands, keyboard shortcuts, and CLI flags
- Interact with users via UI primitives
- Modify system prompts and intercept tool calls

### 1.1 Extension Loading Mechanism

**Discovery Locations (in priority order):**

1. **Global extensions**: `~/.pi/agent/extensions/*`
2. **Project-local extensions**: `./.pi/extensions/*`
3. **Explicitly configured paths**: via `--extension` flag or config

**Discovery Rules:**

```typescript
// From loader.ts - discoverExtensionsInDir()
// 1. Direct files: extensions/*.ts or *.js → load
// 2. Subdirectory with index: extensions/*/index.ts or index.js → load
// 3. Subdirectory with package.json: extensions/*/package.json with "pi" field → load declared entries
```

**Package.json Manifest Format:**

```json
{
  "pi": {
    "extensions": ["./dist/extension.js"],
    "skills": ["./skills"],
    "themes": ["./themes"],
    "prompts": ["./prompts"]
  }
}
```

**Loading Implementation:**

```typescript
// Uses jiti for TypeScript module loading
const jiti = createJiti(import.meta.url, {
  moduleCache: false,
  // In Bun binary: use virtualModules for bundled packages
  ...(isBunBinary ? { virtualModules: VIRTUAL_MODULES, tryNative: false } : { alias: getAliases() }),
});

const module = await jiti.import(extensionPath, { default: true });
const factory = module as ExtensionFactory;
```

### 1.2 Extension API (Hooks & Events)

**Event-Driven Architecture:**

Extensions subscribe to events via `pi.on(event, handler)`:

```typescript
// Lifecycle Events
pi.on("session_start", handler);
pi.on("session_before_switch", handler);  // Can cancel
pi.on("session_switch", handler);
pi.on("session_before_fork", handler);    // Can cancel
pi.on("session_fork", handler);
pi.on("session_before_compact", handler); // Can cancel or provide custom compaction
pi.on("session_compact", handler);
pi.on("session_shutdown", handler);
pi.on("session_before_tree", handler);    // Can cancel or provide summary
pi.on("session_tree", handler);

// Agent Events
pi.on("context", handler);              // Modify messages before LLM call
pi.on("before_agent_start", handler);   // Modify system prompt
pi.on("agent_start", handler);
pi.on("agent_end", handler);
pi.on("turn_start", handler);
pi.on("turn_end", handler);

// Model Events
pi.on("model_select", handler);

// Tool Events
pi.on("tool_call", handler);            // Can block tool execution
pi.on("tool_result", handler);          // Can modify results

// Input Events
pi.on("user_bash", handler);            // Can provide custom bash operations
pi.on("input", handler);                // Can transform or handle input

// Resource Events
pi.on("resources_discover", handler);   // Provide additional skill/prompt/theme paths
```

**Event Handler Pattern:**

```typescript
// From types.ts
export type ExtensionHandler<E, R = undefined> = 
  (event: E, ctx: ExtensionContext) => Promise<R | void> | R | void;
```

**Cancellable Events Pattern:**

```typescript
// Events that can be cancelled return a result object
pi.on("session_before_switch", async (event, ctx) => {
  const shouldCancel = await someCheck();
  if (shouldCancel) {
    return { cancel: true };
  }
});
```

### 1.3 Tool Registration

**Tool Definition Structure:**

```typescript
import { Type } from "@sinclair/typebox";

pi.registerTool({
  name: "hello",                    // LLM-facing name
  label: "Hello",                   // UI label
  description: "A simple greeting tool",
  parameters: Type.Object({
    name: Type.String({ description: "Name to greet" }),
  }),
  
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    return {
      content: [{ type: "text", text: `Hello, ${params.name}!` }],
      details: { greeted: name },   // Persisted in session
    };
  },
  
  // Optional: Custom UI rendering
  renderCall?: (args, theme) => Component;
  renderResult?: (result, options, theme) => Component;
});
```

**Tool Interception Pattern:**

```typescript
// Block dangerous commands
pi.on("tool_call", async (event, ctx) => {
  if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
    const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
    if (!ok) return { block: true, reason: "Blocked by user" };
  }
});
```

### 1.4 Command Registration

**Slash Commands:**

```typescript
pi.registerCommand("tools", {
  description: "Enable/disable tools",
  getArgumentCompletions?: (prefix) => AutocompleteItem[] | null,
  handler: async (args, ctx) => {
    // Command implementation
    ctx.ui.notify("Tools updated", "info");
  },
});
```

**Keyboard Shortcuts:**

```typescript
pi.registerShortcut("ctrl+t", {
  description: "Toggle tools",
  handler: async (ctx) => {
    // Shortcut implementation
  },
});
```

**CLI Flags:**

```typescript
pi.registerFlag("verbose", {
  type: "boolean",
  default: false,
  description: "Enable verbose output",
});

// Access flag value
const isVerbose = pi.getFlag("verbose");
```

### 1.5 UI Context API

**Available UI Methods:**

```typescript
export interface ExtensionUIContext {
  // Dialogs
  select(title: string, options: string[], opts?): Promise<string | undefined>;
  confirm(title: string, message: string, opts?): Promise<boolean>;
  input(title: string, placeholder?: string, opts?): Promise<string | undefined>;
  
  // Notifications
  notify(message: string, type?: "info" | "warning" | "error"): void;
  
  // Status & Widgets
  setStatus(key: string, text: string | undefined): void;
  setWorkingMessage(message?: string): void;
  setWidget(key: string, content: string[] | ComponentFactory, options?): void;
  
  // Header/Footer Customization
  setFooter(factory: FooterFactory | undefined): void;
  setHeader(factory: HeaderFactory | undefined): void;
  setTitle(title: string): void;
  
  // Editor Control
  setEditorText(text: string): void;
  getEditorText(): string;
  editor(title: string, prefill?: string): Promise<string | undefined>;
  setEditorComponent(factory: EditorFactory | undefined): void;
  
  // Custom Components
  custom<T>(factory: ComponentFactory<T>, options?): Promise<T>;
  
  // Theming
  readonly theme: Theme;
  getAllThemes(): { name: string; path: string | undefined }[];
  getTheme(name: string): Theme | undefined;
  setTheme(theme: string | Theme): { success: boolean; error?: string };
  
  // Tool Display
  getToolsExpanded(): boolean;
  setToolsExpanded(expanded: boolean): void;
}
```

### 1.6 Sandboxing and Security

**Module Isolation:**
- Extensions run in the same process but with controlled imports
- Virtual modules system for bundled binaries
- Jiti loader for TypeScript with module cache disabled

**Reserved Actions (cannot be overridden):**
- `interrupt`, `clear`, `exit`, `suspend`
- `cycleThinkingLevel`, `cycleModelForward`, `cycleModelBackward`
- `selectModel`, `expandTools`, `toggleThinking`
- `externalEditor`, `followUp`, `submit`
- `selectConfirm`, `selectCancel`, `copy`, `deleteToLineEnd`

**Error Handling:**

```typescript
// Errors in extensions don't crash the agent
extensionRunner.onError((error: ExtensionError) => {
  console.error(`Extension error (${error.extensionPath}): ${error.error}`);
});
```

**Sandbox Extension Example:**

```typescript
// examples/extensions/sandbox/ - Uses @anthropic-ai/sandbox-runtime
// Provides OS-level sandboxing with per-project config
```

### 1.7 Extension Examples Analysis

| Example | Pattern Demonstrated |
|---------|---------------------|
| `permission-gate.ts` | Tool call interception for safety |
| `todo.ts` | State persistence via details + custom commands |
| `hello.ts` | Minimal custom tool |
| `custom-compaction.ts` | Custom compaction logic |
| `modal-editor.ts` | Custom editor component |
| `custom-footer.ts` | Footer customization |
| `handoff.ts` | Session management from extensions |
| `ssh.ts` | Tool operation delegation |
| `subagent/` | Nested agent delegation |
| `dynamic-resources/` | Runtime resource discovery |

---

## 2. Skills System Analysis

### 2.1 SKILL.md Format

**File Structure:**

```markdown
---
name: my-skill                    # Must match parent directory name
description: Does something useful
license: MIT
compatibility: pi-coding-agent
metadata:
  author: Jane Doe
  version: 1.0.0
allowed-tools: [read, bash]       # Optional tool restrictions
disable-model-invocation: false   # If true, only via /skill:name command
---

# Skill Content

Instructions for the agent when this skill is invoked...
```

**Name Validation (per Agent Skills spec):**
- Max 64 characters
- Lowercase a-z, 0-9, hyphens only
- Cannot start/end with hyphen
- No consecutive hyphens
- Must match parent directory name

### 2.2 Skill Discovery Mechanism

**Discovery Locations:**

```typescript
// From skills.ts - loadSkills()
1. Global skills: ~/.pi/agent/skills/*/
2. Project-local: ./.pi/skills/*/
3. Explicit paths via skillPaths option
```

**Discovery Rules:**

```typescript
// Direct .md children in the root
// OR recursive SKILL.md under subdirectories
function loadSkillsFromDir(dir: string, source: string): LoadSkillsResult {
  // For each entry:
  // - If file ends with .md and includeRootFiles=true → load as skill
  // - If directory and contains SKILL.md → load recursively
}
```

**Collision Handling:**

```typescript
// Skills with same name: first wins, subsequent are logged as collisions
const existing = skillMap.get(skill.name);
if (existing) {
  collisionDiagnostics.push({
    type: "collision",
    message: `name "${skill.name}" collision`,
    collision: {
      resourceType: "skill",
      name: skill.name,
      winnerPath: existing.filePath,
      loserPath: skill.filePath,
    },
  });
}
```

### 2.3 Skill Execution

**Inclusion in System Prompt:**

```typescript
// From skills.ts - formatSkillsForPrompt()
export function formatSkillsForPrompt(skills: Skill[]): string {
  const visibleSkills = skills.filter(s => !s.disableModelInvocation);
  
  return `
The following skills provide specialized instructions for specific tasks.
Use the read tool to load a skill's file when the task matches its description.

<available_skills>
  <skill>
    <name>${skill.name}</name>
    <description>${skill.description}</description>
    <location>${skill.filePath}</location>
  </skill>
</available_skills>`;
}
```

**Explicit Invocation via Slash Command:**

```typescript
// When enableSkillCommands is true, skills become /skill:name commands
const commandName = `skill:${skill.name}`;
// Command reads the skill file and injects content into context
```

### 2.4 Command Integration

**Slash Command Integration:**

```typescript
// From interactive-mode.ts - setupAutocomplete()
if (this.settingsManager.getEnableSkillCommands()) {
  for (const skill of this.session.resourceLoader.getSkills().skills) {
    const commandName = `skill:${skill.name}`;
    this.skillCommands.set(commandName, skill.filePath);
    skillCommandList.push({ 
      name: commandName, 
      description: skill.description 
    });
  }
}
```

**Skill Block Parsing:**

```typescript
// From agent-session.ts - parseSkillBlock()
export function parseSkillBlock(text: string): ParsedSkillBlock | null {
  const match = text.match(/^<skill name="([^"]+)" location="([^"]+)">\n([\s\S]*?)\n<\/skill>(?:\n\n([\s\S]+))?$/);
  return match ? {
    name: match[1],
    location: match[2],
    content: match[3],
    userMessage: match[4]?.trim() || undefined,
  } : null;
}
```

---

## 3. Session Management Analysis

### 3.1 Tree-Structured Sessions

**Core Data Structure:**

```typescript
// Each entry has id/parentId forming a tree
export interface SessionEntryBase {
  type: string;
  id: string;           // 8-char hex UUID
  parentId: string | null;
  timestamp: string;
}

// Entry Types
export type SessionEntry =
  | SessionMessageEntry      // Regular messages
  | ThinkingLevelChangeEntry // Settings changes
  | ModelChangeEntry
  | CompactionEntry          // Context compaction summaries
  | BranchSummaryEntry       // Branch navigation summaries
  | CustomEntry              // Extension state (not sent to LLM)
  | CustomMessageEntry       // Extension messages (sent to LLM)
  | LabelEntry;              // User-defined bookmarks
```

**Session File Format (JSONL):**

```jsonl
{"type": "session", "version": 3, "id": "uuid", "timestamp": "...", "cwd": "/path"}
{"type": "message", "id": "abc123", "parentId": null, "timestamp": "...", "message": {...}}
{"type": "message", "id": "def456", "parentId": "abc123", "timestamp": "...", "message": {...}}
{"type": "compaction", "id": "ghi789", "parentId": "def456", "summary": "...", "firstKeptEntryId": "..."}
```

### 3.2 Branching Mechanism

**Creating Branches:**

```typescript
// From session-manager.ts
export class SessionManager {
  private leafId: string | null = null;  // Current position
  
  // Move leaf pointer to create new branch
  branch(branchFromId: string): void {
    if (!this.byId.has(branchFromId)) {
      throw new Error(`Entry ${branchFromId} not found`);
    }
    this.leafId = branchFromId;
  }
  
  // Reset to before first entry (for re-editing first message)
  resetLeaf(): void {
    this.leafId = null;
  }
}
```

**Branch with Summary:**

```typescript
// When navigating tree, optionally create summary of abandoned path
branchWithSummary(branchFromId: string | null, summary: string, details?: unknown): string {
  this.leafId = branchFromId;
  const entry: BranchSummaryEntry = {
    type: "branch_summary",
    id: generateId(this.byId),
    parentId: branchFromId,
    summary,
    fromId: branchFromId ?? "root",
    details,
    fromHook,  // True if generated by extension
  };
  this._appendEntry(entry);
  return entry.id;
}
```

### 3.3 Compaction Mechanism

**Compaction Preparation:**

```typescript
// From compaction.ts - prepareCompaction()
export interface CompactionPreparation {
  firstKeptEntryId: string;      // UUID of first entry to keep
  messagesToSummarize: AgentMessage[];  // Messages to summarize
  turnPrefixMessages: AgentMessage[];   // If splitting turn
  isSplitTurn: boolean;
  tokensBefore: number;
  previousSummary?: string;      // For iterative updates
  fileOps: FileOperations;       // Tracked file operations
  settings: CompactionSettings;
}
```

**Compaction Algorithm:**

```typescript
// From compaction.ts - findCutPoint()
function findCutPoint(entries, startIndex, endIndex, keepRecentTokens): CutPointResult {
  // Walk backwards from newest, accumulating estimated tokens
  // Stop when accumulated >= keepRecentTokens
  // Cut at closest valid cut point (user/assistant/branch messages, never tool results)
  
  return {
    firstKeptEntryIndex,
    turnStartIndex,    // If cutting mid-turn
    isSplitTurn: !isUserMessage && turnStartIndex !== -1,
  };
}
```

**Summarization Process:**

```typescript
// Two-phase summarization when splitting turns
async function compact(preparation, model, apiKey): Promise<CompactionResult> {
  if (isSplitTurn && turnPrefixMessages.length > 0) {
    // Generate both summaries in parallel
    const [historyResult, turnPrefixResult] = await Promise.all([
      generateSummary(messagesToSummarize, ...),
      generateTurnPrefixSummary(turnPrefixMessages, ...),
    ]);
    summary = `${historyResult}\n\n---\n\n**Turn Context:**\n\n${turnPrefixResult}`;
  } else {
    summary = await generateSummary(messagesToSummarize, ...);
  }
  
  return { summary, firstKeptEntryId, tokensBefore, details };
}
```

### 3.4 Persistence Mechanisms

**Session Storage:**

```typescript
// JSONL append-only format
private _persist(entry: SessionEntry): void {
  if (!this.persist || !this.sessionFile) return;
  
  // Don't persist until first assistant message (avoid empty sessions)
  const hasAssistant = this.fileEntries.some(e => 
    e.type === "message" && e.message.role === "assistant"
  );
  if (!hasAssistant) return;
  
  if (!this.flushed) {
    // First persistence: write all entries
    for (const e of this.fileEntries) {
      appendFileSync(this.sessionFile, `${JSON.stringify(e)}\n`);
    }
    this.flushed = true;
  } else {
    // Subsequent: append only new entry
    appendFileSync(this.sessionFile, `${JSON.stringify(entry)}\n`);
  }
}
```

**Session Migration:**

```typescript
// From session-manager.ts - migrateToCurrentVersion()
function migrateToCurrentVersion(entries: FileEntry[]): boolean {
  const version = header?.version ?? 1;
  
  if (version < 2) migrateV1ToV2(entries);  // Add id/parentId tree structure
  if (version < 3) migrateV2ToV3(entries);  // Rename hookMessage role to custom
  
  return true;
}
```

### 3.5 Navigation Patterns

**Tree Navigation:**

```typescript
// Get tree structure for UI
getTree(): SessionTreeNode[] {
  // Build node map
  // Link children to parents
  // Sort children by timestamp
  // Return roots (entries with parentId === null)
}

// Navigate to specific point
navigateTree(targetId: string, options?): Promise<{ cancelled: boolean }> {
  // 1. Calculate common ancestor
  // 2. Collect entries to summarize (abandoned path)
  // 3. Generate summary if user wants
  // 4. Move leaf pointer to target
  // 5. Emit session_tree event
}
```

**Forking:**

```typescript
// Create new session from current branch point
async fork(entryId: string): Promise<{ cancelled: boolean; selectedText?: string }> {
  // 1. Get messages up to entryId
  // 2. Create new session file with copied history
  // 3. Switch to new session
  // 4. Emit session_fork event
}
```

**Building Context for LLM:**

```typescript
// From session-manager.ts - buildSessionContext()
export function buildSessionContext(entries, leafId, byId): SessionContext {
  // Walk from leaf to root, collecting path
  // Find compaction boundaries
  // If compaction found:
  //   - Emit summary as first message
  //   - Emit kept messages (from firstKeptEntryId to compaction)
  //   - Emit messages after compaction
  // Else:
  //   - Emit all messages
  
  return { messages, thinkingLevel, model };
}
```

---

## 4. Mode Architecture

### 4.1 Mode Types

**Three Primary Modes:**

1. **Interactive Mode** (`src/modes/interactive/`)
   - Full TUI with chat interface
   - Editor with autocomplete
   - Real-time streaming display
   - Extension UI support

2. **Print Mode** (`src/modes/print-mode.ts`)
   - Single-shot CLI operation
   - Text or JSON output
   - No UI, minimal overhead

3. **RPC Mode** (`src/modes/rpc/`)
   - Headless JSON protocol
   - stdin/stdout communication
   - For embedding in other applications

### 4.2 Interactive Mode (TUI)

**Architecture:**

```typescript
export class InteractiveMode {
  private session: AgentSession;      // Core session logic
  private ui: TUI;                     // Terminal UI framework
  private chatContainer: Container;    // Message display area
  private editor: EditorComponent;     // Input editor
  private footer: FooterComponent;     // Status bar
  
  // Extension UI state
  private extensionWidgetsAbove: Map<string, Component>;
  private extensionWidgetsBelow: Map<string, Component>;
  private customFooter?: Component;
  private customHeader?: Component;
}
```

**Key Components:**

```typescript
// UI Layout (in order)
headerContainer      // Logo, hints, changelog
chatContainer        // Message history
pendingMessagesContainer  // Queued messages
statusContainer      // Status messages
widgetContainerAbove // Extension widgets (above editor)
editorContainer      // Input editor
widgetContainerBelow // Extension widgets (below editor)
footer              // Status bar / custom footer
```

**Extension UI Context for Interactive:**

```typescript
// Full UI capabilities
const uiContext: ExtensionUIContext = {
  select: (title, options) => showSelector(title, options),
  confirm: (title, message) => showConfirm(title, message),
  input: (title, placeholder) => showInput(title, placeholder),
  notify: (message, type) => showNotification(message, type),
  setWidget: (key, content, options) => setWidget(key, content, options),
  setFooter: (factory) => setCustomFooter(factory),
  setHeader: (factory) => setCustomHeader(factory),
  custom: (factory) => showCustomComponent(factory),
  // ... all UI methods available
};
```

### 4.3 Print Mode (CLI)

**Usage:**

```bash
pi -p "prompt text"              # Text output
pi --mode json "prompt text"     # JSON event stream
```

**Implementation:**

```typescript
export async function runPrintMode(session: AgentSession, options: PrintModeOptions): Promise<void> {
  // Set up extensions without UI
  await session.bindExtensions({
    commandContextActions: { ... },
    onError: (err) => console.error(...),
  });
  
  // Subscribe to events
  session.subscribe((event) => {
    if (mode === "json") {
      console.log(JSON.stringify(event));
    }
  });
  
  // Send prompts
  await session.prompt(initialMessage);
  
  // Output final response
  if (mode === "text") {
    console.log(lastAssistantMessage.text);
  }
}
```

### 4.4 RPC Mode (API)

**Protocol:**

```typescript
// Commands (stdin) → JSON lines
{ id?: string; type: "prompt"; message: string; images?: ImageContent[] }
{ id?: string; type: "get_state" }
{ id?: string; type: "set_model"; provider: string; modelId: string }
{ id?: string; type: "compact"; customInstructions?: string }

// Responses (stdout) ← JSON lines
{ id?: string; type: "response"; command: string; success: boolean; data?: object; error?: string }

// Events (stdout) ← JSON lines (streaming)
{ type: "agent_start" }
{ type: "turn_end"; turnIndex: number; message: AgentMessage }
```

**Extension UI in RPC:**

```typescript
// UI requests emitted as events
{ type: "extension_ui_request"; id: string; method: "select"; title: string; options: string[] }
{ type: "extension_ui_request"; id: string; method: "confirm"; title: string; message: string }

// Client responds with
{ type: "extension_ui_response"; id: string; value: string | confirmed: boolean | cancelled: true }
```

**Limited UI Support:**

```typescript
// RPC mode UI context - many methods no-op or limited
const createExtensionUIContext = (): ExtensionUIContext => ({
  select, confirm, input, editor, // Via RPC protocol
  notify, setStatus, setTitle, setEditorText, // Fire-and-forget
  setWidget, // String arrays only (no component factories)
  setFooter, setHeader, setEditorComponent, custom, // Not supported
  setTheme, // Not supported
});
```

### 4.5 Mode Switching

**Not Runtime-Switchable:**
Modes are selected at startup via CLI flags and remain fixed for the process lifetime.

```bash
pi                              # Interactive mode (default)
pi -p "prompt"                  # Print mode (text)
pi --mode json -p "prompt"      # Print mode (JSON)
pi --mode rpc                   # RPC mode
```

**Shared Core:**
All modes use `AgentSession` for core logic, differing only in I/O layer:

```typescript
export class AgentSession {
  // Shared across all modes
  agent: Agent;
  sessionManager: SessionManager;
  extensionRunner: ExtensionRunner;
  
  // Mode-agnostic operations
  prompt(message): Promise<void>;
  steer(message): Promise<void>;
  compact(): Promise<CompactionResult>;
  newSession(): Promise<boolean>;
  fork(entryId): Promise<{ cancelled: boolean }>;
}
```

---

## 5. Integration Recommendations for Godel

### 5.1 Extension System for Godel Agents

**Recommended Pattern: Agent-as-Extension Model**

```typescript
// Godel agents could be implemented as pi-coding-agent extensions
godel-agent/
├── package.json          # With "pi" manifest
├── src/
│   ├── index.ts         # Extension entry point
│   ├── tools/           # Agent-specific tools
│   └── skills/          # Agent capabilities as skills
└── prompts/
    └── system.md        # Agent system prompt
```

**Key Integration Points:**

```typescript
// 1. Register Godel agent as an extension
export default function dashAgentExtension(pi: ExtensionAPI) {
  // Register Godel-specific tools
  pi.registerTool({
    name: "dash_query",
    description: "Query the Godel knowledge graph",
    parameters: Type.Object({ query: Type.String() }),
    execute: async (id, params, signal, onUpdate, ctx) => {
      // Execute against Godel backend
    },
  });
  
  // 2. Hook into session events for agent lifecycle
  pi.on("session_start", async (event, ctx) => {
    // Initialize agent state
  });
  
  // 3. Custom commands for agent management
  pi.registerCommand("godel", {
    description: "Godel agent commands",
    handler: async (args, ctx) => {
      // Handle /godel commands
    },
  });
}
```

**Benefits:**
- Extensions provide isolation between agents
- Standardized tool registration and execution
- Event-driven lifecycle management
- UI integration for interactive agents

### 5.2 Skills for Agent Capabilities

**Agent Capability Packaging:**

```markdown
---
name: security-audit
description: Performs security audits on code repositories
allowed-tools: [read, bash, grep]
disable-model-invocation: false
---

# Security Audit Skill

When invoked, perform a comprehensive security audit:

1. Scan for secrets in code
2. Check dependencies for known vulnerabilities
3. Review authentication patterns
4. Generate security report
```

**Dynamic Skill Discovery:**

```typescript
// Godel could expose agent capabilities as skills
pi.on("resources_discover", async (event, ctx) => {
  // Query Godel registry for available agent capabilities
  const capabilities = await dashRegistry.queryCapabilities();
  
  return {
    skillPaths: capabilities.map(c => c.skillPath),
    promptPaths: capabilities.map(c => c.promptPath),
  };
});
```

**Skill-Based Agent Selection:**

```typescript
// Map skills to specialized agents
const skillAgentMap = {
  "security-audit": "godel-security-agent",
  "performance-optimize": "godel-perf-agent",
  "refactor": "godel-refactor-agent",
};

pi.on("input", async (event, ctx) => {
  // Analyze input to detect required skills
  const detectedSkills = await analyzeForSkills(event.text);
  
  // Route to appropriate agent or spawn subagent
  if (detectedSkills.length > 0) {
    // Transform input with skill context
    return { 
      action: "transform", 
      text: addSkillContext(event.text, detectedSkills)
    };
  }
  
  return { action: "continue" };
});
```

### 5.3 Session Tree for Agent Lineage

**Forking for Agent Variants:**

```typescript
// Create agent variants by forking sessions
export async function createAgentVariant(baseAgentId: string, variantConfig: object) {
  // 1. Load base agent session
  const session = SessionManager.open(baseAgentId);
  
  // 2. Fork at specific point
  const branchPoint = findInitializationCompleteEntry(session);
  
  // 3. Create new variant session
  const variantSession = session.createBranchedSession(branchPoint);
  
  // 4. Apply variant configuration
  applyConfig(variantSession, variantConfig);
  
  return variantSession;
}
```

**Lineage Tracking:**

```typescript
// Track agent lineage through session parent relationships
interface AgentLineage {
  sessionId: string;
  parentSession?: string;      // From SessionHeader.parentSession
  created: Date;
  config: object;
  performance: Metrics;
}

// Build family tree
function buildAgentFamilyTree(agentId: string): AgentLineage[] {
  const sessions = SessionManager.listAll();
  const familyTree: AgentLineage[] = [];
  
  let current = sessions.find(s => s.id === agentId);
  while (current) {
    familyTree.unshift(current);
    current = current.parentSessionPath 
      ? sessions.find(s => s.path === current!.parentSessionPath)
      : undefined;
  }
  
  return familyTree;
}
```

**Branch Navigation for A/B Testing:**

```typescript
// Compare agent variants via tree navigation
async function compareAgentVariants(variantA: string, variantB: string) {
  // Navigate to variant A
  await session.navigateTree(variantA, { summarize: false });
  const resultA = await runBenchmark(session);
  
  // Navigate to variant B
  await session.navigateTree(variantB, { summarize: false });
  const resultB = await runBenchmark(session);
  
  return compareResults(resultA, resultB);
}
```

### 5.4 Compaction for Long-Running Agents

**Agent Memory Management:**

```typescript
// Custom compaction for agent-specific state
pi.on("session_before_compact", async (event, ctx) => {
  const preparation = event.preparation;
  
  // Extract agent-specific memories
  const agentMemories = extractMemories(preparation.messagesToSummarize);
  
  // Generate structured summary with memory emphasis
  const summary = await generateAgentSummary(agentMemories);
  
  return {
    compaction: {
      summary,
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      details: { memories: agentMemories },
    },
  };
});
```

### 5.5 Recommended Architecture for Godel

```
Godel System Architecture
├── Agent Runtime (pi-coding-agent based)
│   ├── Extension Loader          # Load Godel agents as extensions
│   ├── Session Manager           # Tree-structured agent sessions
│   ├── Skill Registry            # Agent capabilities as skills
│   └── Compaction Engine         # Agent memory management
│
├── Agent Registry
│   ├── Agent Definitions         # Skills, tools, prompts per agent
│   ├── Lineage Tracking          # Parent/child relationships
│   └── Variant Management        # Fork/branch for A/B testing
│
├── Orchestration Layer
│   ├── Agent Router              # Route tasks to appropriate agents
│   ├── Subagent Spawner          # Spawn child agents for subtasks
│   └── Result Aggregator         # Combine results from multiple agents
│
└── Persistence
    ├── Session Store             # JSONL session files
    ├── Model Checkpoints         # Save/restore agent state
    └── Metrics DB                # Performance tracking
```

### 5.6 Implementation Priorities

**Phase 1: Foundation**
1. Port session manager with tree structure
2. Implement basic extension loading
3. Add skill discovery mechanism

**Phase 2: Agent System**
1. Agent-as-extension wrapper
2. Skill-based capability system
3. Fork/branch for agent variants

**Phase 3: Advanced Features**
1. Custom compaction for agent memory
2. Multi-agent orchestration
3. Lineage and metrics tracking

---

## Summary

The pi-mono coding-agent provides a mature, well-architected foundation for building sophisticated agent systems:

1. **Extension System**: Event-driven, sandboxed plugin architecture with comprehensive lifecycle hooks
2. **Skills System**: Declarative capability packaging with automatic discovery and collision handling
3. **Session Management**: Tree-structured conversations with branching, compaction, and full persistence
4. **Mode Architecture**: Clean separation between interactive, CLI, and API modes sharing a common core

These patterns are directly applicable to Godel's 50-agent architecture, providing:
- Agent isolation via extensions
- Capability sharing via skills
- Lineage tracking via session trees
- Memory management via compaction
- Flexible deployment via mode architecture

---

*Analysis generated for Godel project integration planning.*
