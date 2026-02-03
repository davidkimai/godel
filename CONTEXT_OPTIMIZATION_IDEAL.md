# /interview: Ideal Context Summarization System

**Interviewer:** Claude Code (analyzing current system)  
**Interviewee:** Claude Code (designing ideal system)  
**Topic:** Does current system help context window? How to improve?

---

## Q1: Does the current system help?

**A: NO - Critical failures identified**

### Problem 1: Wrong Data Source
```
Current: /Users/jasontang/clawd/sessions/
Reality: OpenClaw sessions stored elsewhere or in-memory
Impact: System processes zero sessions (0 found)
Evidence: Test run showed "0 sessions, 0 compressed"
```

### Problem 2: Wrong Compression Strategy
```
Current: Keep first 5 + last 5 messages
Problem: Loses critical context from middle of conversation
Result: Claude loses 80% of conversation history
```

### Problem 3: Summaries Not Integrated
```
Current: Saves to .summaries/ directory
Reality: Never loaded back into context
Result: Summaries exist but are useless
```

### Problem 4: No Active Context Management
```
Current: Runs every 30 minutes, passive
Problem: Context window fills up before summarization runs
Result: Too late - context already overflowed
```

---

## Q2: What should context summarization DO?

**A: Core Purposes**

### 1. Preserve Important Context
```
- Key decisions made
- User preferences stated
- Technical solutions found
- Long-term memories to keep
```

### 2. Remove Redundant Noise
```
- Repetitive acknowledgments
- System messages
- Failed attempts
- Expired information
```

### 3. Generate Actionable Summaries
```
- "Currently working on: X"
- "Waiting for: Y"
- "Known issues: Z"
- "Next steps: A, B, C"
```

### 4. Integrate with Context Window
```
- Active compression before limit reached
- Progressive summarization (levels)
- Seamless injection into context
```

---

## Q3: What does the ideal system look like?

**A: 4-Component Architecture**

### Component 1: Context Monitor (Active)
```
Purpose: Watch context window in real-time
Features:
- Track token usage per message
- Detect approaching limit (e.g., 80% of 200K)
- Trigger compression BEFORE overflow
- Log context size over time

Output: .dash/context-monitor.json
```

### Component 2: Intelligent Summarizer
```
Purpose: Generate useful summaries, not just compression

Features:
- Extract decisions, not just trim messages
- Preserve technical details
- Summarize by topic/thread
- Create hierarchical summaries (session → topic → decision)

Output: Structured summary JSON, not plain text
```

### Component 3: Memory Manager
```
Purpose: Manage long-term vs short-term context

Features:
- Identify "must keep" vs "can summarize"
- Extract persistent preferences
- Create "memory anchors" for key info
- Auto-load relevant memories

Output: .claude/memories/ directory
```

### Component 4: Context Injector
```
Purpose: Seamlessly integrate summaries into context

Features:
- Format summaries as Claude-friendly prompts
- Preserve conversation continuity markers
- Allow progressive loading (summary levels)
- Track what context is loaded

Output: Injectable context blocks
```

---

## Q4: How should summarization work?

**A: Progressive Context Pyramid**

```
┌─────────────────────────────────────────────────┐
│  LEVEL 1: Current Message (always full)         │
├─────────────────────────────────────────────────┤
│  LEVEL 2: Last 5 messages (recent context)      │
├─────────────────────────────────────────────────┤
│  LEVEL 3: Session Summary (1-2 paragraphs)      │
├─────────────────────────────────────────────────┤
│  LEVEL 4: Topic Summaries (key decisions)       │
├─────────────────────────────────────────────────┤
│  LEVEL 5: Long-term Memories (persistent)       │
├─────────────────────────────────────────────────┤
│  LEVEL 6: Session Archival (compressed)         │
└─────────────────────────────────────────────────┘

Each level loaded only when needed, based on available context.
```

---

## Q5: What information should be summarized?

**A: Extract & Preserve Priority Matrix**

| Priority | Information | Action | Retention |
|----------|-------------|--------|-----------|
| **P0** | User preferences, names, project context | KEEP | Permanent |
| **P1** | Technical solutions, code patterns | SUMMARIZE | Long-term |
| **P2** | Task progress, current state | SUMMARIZE | Session |
| **P3** | Discussion details, iterations | COMPRESS | Short-term |
| **P4** | Acknowledgments, system messages | REMOVE | Never |

---

## Q6: How to integrate with OpenClaw?

**A: API Integration Points**

### Integration 1: Session Hook
```javascript
// After each message in OpenClaw session
onMessage(message) {
  contextMonitor.track(message);
  if (contextMonitor.atThreshold()) {
    summarizer.summarize();
  }
}
```

### Integration 2: Context Injection
```javascript
// When Claude requests context
getContext() {
  return {
    current: messages.slice(-5),
    summary: loadSummary(sessionId),
    memories: loadRelevantMemories(),
    decisions: loadDecisions()
  };
}
```

### Integration 3: Memory Anchors
```javascript
// User says something important
onImportantInfo(info) {
  memoryManager.extract({
    type: 'preference',
    content: info,
    importance: 'high'
  });
}
```

---

## Q7: What metrics should we track?

**A: Context Efficiency Metrics**

| Metric | Target | Alert If |
|--------|--------|----------|
| **Context Utilization** | 70-90% | >95% |
| **Compression Ratio** | >3x | <2x |
| **Memory Recall Accuracy** | >80% | <50% |
| **Summarization Latency** | <100ms | >500ms |
| **Context Overflows** | 0 | >1 |

---

## Q8: What should the ideal implementation look like?

**A: Context Optimization System V2**

```
┌─────────────────────────────────────────────────────────────┐
│            CONTEXT OPTIMIZATION SYSTEM V2                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ CONTEXT         │───▶│ TOKEN           │                │
│  │ MONITOR         │    │ COUNTER         │                │
│  └─────────────────┘    └─────────────────┘                │
│         │                        │                         │
│         │ Trigger at 80%         │                         │
│         ▼                        ▼                         │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ INTELLIGENT     │───▶│ SUMMARY         │                │
│  │ SUMMARIZER      │    │ GENERATOR       │                │
│  └─────────────────┘    └─────────────────┘                │
│         │                        │                         │
│         │ Structured output      │                         │
│         ▼                        ▼                         │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ MEMORY          │◀───│ DECISION        │                │
│  │ MANAGER         │    │ EXTRACTOR       │                │
│  └─────────────────┘    └─────────────────┘                │
│         │                        │                         │
│         │ Long-term memory       │ Key decisions          │
│         ▼                        ▼                         │
│  ┌─────────────────────────────────────────────────┐       │
│  │              CONTEXT INJECTOR                   │       │
│  │  (Seamlessly loads relevant context on demand)  │       │
│  └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Q9: What files should we create?

**A: Implementation Plan**

| File | Purpose |
|------|---------|
| `scripts/context-monitor.js` | Real-time context tracking |
| `scripts/intelligent-summarizer.js` | AI-powered summarization |
| `scripts/memory-manager.js` | Long-term memory storage |
| `scripts/context-injector.js` | Context loading helper |
| `.claude/memories/` | Persistent memory storage |
| `CONTEXT_OPTIMIZATION.md` | Full system documentation |

---

## Q10: How to measure success?

**A: Success Criteria**

### Quantitative
- [ ] Context never overflows (0 timeouts)
- [ ] Compression ratio >3x
- [ ] Memory recall accuracy >80%
- [ ] Summarization <100ms latency

### Qualitative
- [ ] Claude maintains context across sessions
- [ ] Important information never lost
- [ ] No repeated questions from Claude
- [ ] Seamless user experience

---

## Summary: Current vs Ideal

| Aspect | Current | Ideal |
|--------|---------|-------|
| **Data Source** | Wrong directory | OpenClaw session API |
| **Trigger** | Every 30 min (passive) | Real-time (80% threshold) |
| **Compression** | Trim messages | Extract decisions |
| **Summaries** | Saved, never used | Actively injected |
| **Memory** | None | Persistent preferences |
| **Integration** | Standalone | Deep OpenClaw integration |

---

## Next Steps

1. **Audit** actual OpenClaw session storage location
2. **Build** Context Monitor with token counting
3. **Build** Intelligent Summarizer (not just compression)
4. **Build** Memory Manager for long-term storage
5. **Integrate** with OpenClaw session lifecycle
6. **Test** with real conversation data

---

Now I'll implement the ideal system based on this analysis.
