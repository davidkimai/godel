# Swarm Protocol v3 - 10-Minute Sprints with Self-Improvement

**Version:** 3.0.0  
**Date:** 2026-02-03  
**Principles:** Speed (10-min cycles), Self-Improvement, Parallel Execution, Constant Productivity

---

## Core Philosophy

| Principle | Target | Mechanism |
|-----------|--------|-----------|
| **Speed** | ≤10 min per task | Parallel worktrees, pre-built prompts |
| **Self-Improvement** | Every cycle improves system | Refactor, document, optimize, test |
| **Parallel** | 5-10x speedup | Multiple worktrees simultaneously |
| **Constant** | 24/7 productivity | No idle time, always improving |

---

## 10-Minute Sprint Cycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    10-MINUTE SPRINT                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Minute 0-1:   Clone task, read context                        │
│  Minute 1-5:   Execute work (parallel agents)                  │
│  Minute 5-8:   Verify deliverables, run tests                  │
│  Minute 8-10:  Commit, push, report                            │
│                                                                 │
│  🎯 Target: COMPLETE subtask in 10 minutes or less             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Self-Improvement Swarm Types

### Type A: Code Improvement Swarm
```
Tasks per cycle:
1. Find code smell → Refactor it
2. Add/fix test → Run tests
3. Update documentation → Verify docs build
4. Commit all improvements
```

### Type B: Process Improvement Swarm
```
Tasks per cycle:
1. Review recent logs → Identify friction
2. Optimize prompt/template → Test improvement
3. Add automation → Verify it works
4. Document lesson learned
```

### Type C: Research Swarm (Fast)
```
Tasks per cycle:
1. Research specific question → 3 min max
2. Document findings → 2 min
3. Implement example → 3 min
4. Commit + push → 2 min
```

---

## Parallel Worktree Execution Pattern

```bash
#!/bin/bash
# swarm-v3-parallel.sh - Launch multiple 10-minute swarms in parallel

SPRINT_DIR=".claude-worktrees/sprint-$(date +%Y%m%d-%H%M%S)"
mkdir -p $SPRINT_DIR

echo "🚀 Launching 5 parallel 10-minute swarms..."

# Swarm 1: Code Improvement
git worktree add $SPRINT_DIR/improvement-1 origin/main
cd $SPRINT_DIR/improvement-1
kimi -p "REFACTOR: Improve error handling in src/core/llm.ts. 
Add proper TypeScript types, better error messages, and tests.
TIMELINE: Complete in 10 minutes. Commit on completion." &

# Swarm 2: Documentation
git worktree add $SPRINT_DIR/docs-1 origin/main
cd $SPRINT_DIR/docs-1
kimi -p "DOCS: Update API documentation for src/core/llm.ts.
Generate TypeDoc comments, update README examples.
TIMELINE: Complete in 10 minutes. Commit on completion." &

# Swarm 3: Tests
git worktree add $SPRINT_DIR/tests-1 origin/main
cd $SPRINT_DIR/tests-1
kimi -p "TEST: Add integration tests for src/core/autonomous-state.ts.
Cover: init, pause, resume, error recovery.
TIMELINE: Complete in 10 minutes. Commit on completion." &

# Swarm 4: Research
git worktree add $SPRINT_DIR/research-1 origin/main
cd $SPRINT_DIR/research-1
kimi -p "RESEARCH: Compare pi-ai vs OpenClaw Gateway for LLM handling.
Output: 5-bullet summary + recommendation + implementation snippet.
TIMELINE: Complete in 10 minutes. Commit on completion." &

# Swarm 5: Optimization
git worktree add $SPRINT_DIR/opt-1 origin/main
cd $SPRINT_DIR/opt-1
kimi -p "OPTIMIZE: Profile and improve npm run build time.
Find slowest step, optimize or parallelize.
TIMELINE: Complete in 10 minutes. Commit on completion." &

echo "✅ 5 parallel swarms launched in $SPRINT_DIR"
echo "⏱️  Will complete in ~10 minutes"
```

---

## Kimi Swarm v3 - Fast & Self-Improving

```python
#!/usr/bin/env python3
"""
Kimi Swarm v3 - 10-Minute Sprint Protocol

Features:
- Strict 10-minute timebox
- Self-improvement focus
- Automatic commit + push
- Parallel execution support
- Metrics tracking

Usage:
  kimi-swarm-v3 "Your 10-minute task" --self-improve
  kimi-swarm-v3 --parallel 5 "Multiple parallel swarms"
"""

import subprocess
import asyncio
import time
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json

class KimiSwarmV3:
    def __init__(self, task: str, timebox_minutes: int = 10, self_improve: bool = False):
        self.task = task
        self.timebox_seconds = timebox_minutes * 60
        self.self_improve = self_improve
        self.output_dir = f".swarm-v3/{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        self.start_time = None
        self.cycles_completed = 0
        self.improvements_made = []
        
        Path(self.output_dir).mkdir(parents=True, exist_ok=True)
    
    async def run(self):
        """Execute 10-minute sprint."""
        self.start_time = time.time()
        print(f"🚀 Starting 10-min sprint: {self.task}")
        
        # Track start state
        self._record_state("start")
        
        # Execute work with timebox
        result = await self._execute_with_timebox()
        
        # Record end state
        self._record_state("end")
        
        # Push to GitHub
        await self._push_results()
        
        return self._summarize()
    
    async def _execute_with_timebox(self):
        """Execute task within timebox."""
        task_file = f"{self.output_dir}/task.md"
        output_file = f"{self.output_dir}/output.md"
        improvement_file = f"{self.output_dir}/improvements.json"
        
        # Write task
        with open(task_file, 'w') as f:
            f.write(f"# 10-Minute Sprint\n\nTask: {self.task}\n")
        
        # Build prompt with self-improvement focus
        improvement_context = ""
        if self.self_improve:
            improvement_context = """
            
CRITICAL: You are a self-improving swarm. After completing the main task:
1. Identify 1-2 ways the code/process could be improved
2. Make at least 1 improvement (refactor, test, docs, etc.)
3. Document the improvement in improvements.json
4. Commit all changes including improvements
"""
        
        prompt = f"""{self.task}

TIMELINE: Complete in 10 minutes or less!

Required actions:
1. Read relevant context files first
2. Make your changes
3. Run: npm run build (verify no errors)
4. Run: npm test (verify tests pass)
5. git add -A && git commit -m "feat: {self.task[:60]}..."
{improvement_context}

Start immediately. Report progress every 2 minutes.

Output to: {output_file}"""

        # Execute with timeout
        try:
            result = await asyncio.wait_for(
                self._run_kimi(prompt),
                timeout=self.timebox_seconds
            )
            return result
        except asyncio.TimeoutError:
            print(f"⏰ Timebox exceeded ({self.timebox_seconds}s)")
            # Force commit what we have
            await self._force_commit()
            return {"status": "timeout", "task": self.task}
    
    async def _run_kimi(self, prompt: str):
        """Run Kimi with prompt."""
        proc = await asyncio.create_subprocess_exec(
            'kimi', '-p', prompt,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await proc.communicate()
        
        # Write output
        output_file = f"{self.output_dir}/output.md"
        with open(output_file, 'wb') as f:
            f.write(stdout)
        
        # Force commit
        await self._force_commit()
        
        return {
            "status": "success" if proc.returncode == 0 else "failed",
            "returncode": proc.returncode
        }
    
    async def _force_commit(self):
        """Force commit all changes."""
        # Add all changes
        subprocess.run(['git', 'add', '-A'], capture_output=True)
        
        # Check if there are changes
        status = subprocess.run(
            ['git', 'status', '--porcelain'],
            capture_output=True, text=True
        )
        
        if status.stdout.strip():
            # Create commit with timestamp
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')
            msg = f"sprint({timestamp}): {self.task[:70]}..."
            
            subprocess.run(['git', 'commit', '-m', msg], capture_output=True)
            
            print(f"✅ Committed: {msg}")
    
    async def _push_results(self):
        """Push results to GitHub."""
        result = subprocess.run(['git', 'push', 'origin', 'main'], capture_output=True)
        if result.returncode == 0:
            print("✅ Pushed to GitHub")
        else:
            print("⚠️  Push failed (may need rebase)")
    
    def _record_state(self, phase: str):
        """Record system state at phase."""
        state = {
            "phase": phase,
            "timestamp": datetime.now().isoformat(),
            "task": self.task,
            "files": list(Path('.').rglob('*.ts')),
            "tests": self._count_tests(),
        }
        
        with open(f"{self.output_dir}/state-{phase}.json", 'w') as f:
            json.dump(state, f, indent=2)
    
    def _count_tests(self):
        """Count test files."""
        return len(list(Path('.').rglob('*.test.ts')))
    
    def _summarize(self):
        """Summarize sprint results."""
        elapsed = time.time() - self.start_time
        
        return {
            "task": self.task,
            "timebox_seconds": self.timebox_seconds,
            "actual_seconds": elapsed,
            "within_timebox": elapsed <= self.timebox_seconds,
            "self_improve": self.self_improve,
            "cycles": self.cycles_completed + 1,
            "output_dir": self.output_dir
        }


class ParallelSwarmV3:
    """Execute multiple swarms in parallel."""
    
    def __init__(self, num_swarms: int = 5, timebox_minutes: int = 10):
        self.num_swarms = num_swarms
        self.timebox = timebox_minutes
        self.results = []
    
    async def run(self, tasks: list):
        """Run multiple swarms in parallel."""
        print(f"🚀 Launching {self.num_swarms} parallel 10-min swarms...")
        
        with ThreadPoolExecutor(max_workers=self.num_swarms) as executor:
            futures = []
            for i, task in enumerate(tasks[:self.num_swarms]):
                swarm = KimiSwarmV3(task, self.timebox)
                futures.append(executor.submit(asyncio.run, swarm.run()))
            
            # Collect results
            for future in futures:
                self.results.append(future.result())
        
        return self._parallel_summary()
    
    def _parallel_summary(self):
        """Summarize parallel execution."""
        return {
            "swarms_executed": len(self.results),
            "all_within_timebox": all(r["within_timebox"] for r in self.results),
            "total_output_dirs": len(self.results),
            "results": self.results
        }


# CLI
if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description="Kimi Swarm v3 - 10-Min Sprints")
    parser.add_argument("task", nargs="?", help="Task to execute")
    parser.add_argument("--timebox", type=int, default=10, help="Timebox in minutes")
    parser.add_argument("--self-improve", action="store_true", help="Enable self-improvement")
    parser.add_argument("--parallel", type=int, default=1, help="Number of parallel swarms")
    parser.add_argument("--tasks-file", help="File with list of tasks")
    
    args = parser.parse_args()
    
    if args.tasks_file:
        with open(args.tasks_file) as f:
            tasks = [line.strip() for line in f if line.strip()]
    elif args.task:
        tasks = [args.task]
    else:
        print("Usage: kimi-swarm-v3 'task' [--timebox 10] [--self-improve]")
        sys.exit(1)
    
    if args.parallel > 1:
        swarm = ParallelSwarmV3(args.parallel, args.timebox)
        result = asyncio.run(swarm.run(tasks))
    else:
        swarm = KimiSwarmV3(args.task, args.timebox, args.self_improve)
        result = asyncio.run(swarm.run())
    
    print(f"\n📊 RESULT: {result}")
```

---

## 10-Minute Sprint Tasks (Pre-Built)

```yaml
# sprint-tasks.yaml - Pre-defined 10-minute tasks

code_improvement:
  - "Refactor src/core/llm.ts - Add better error types"
  - "Optimize src/core/autonomous-state.ts - Reduce re-renders"
  - "Add type safety to src/integrations/openclaw/*.ts"
  - "Improve logging in src/core/decision-engine.ts"

documentation:
  - "Update README with quick start guide"
  - "Add API docs for src/core/llm.ts"
  - "Create architecture diagram for src/core/"
  - "Document autonomous state machine"

testing:
  - "Add unit tests for src/core/llm.ts"
  - "Add integration tests for autonomous-state.ts"
  - "Add E2E test for OpenClaw Gateway integration"
  - "Increase test coverage to 90%"

research:
  - "Research pi-ai streaming API - 5 bullet summary"
  - "Compare 3 LLM providers - Kimi vs Claude vs GPT"
  - "Evaluate async/await patterns in Node.js 22"
  - "Assess TypeScript 5.8 new features"

optimization:
  - "Optimize npm run build - reduce time by 20%"
  - "Parallelize test execution"
  - "Add build caching"
  - "Profile and optimize decision-engine.ts"
```

---

## Recursive Self-Improvement Loop

```
┌─────────────────────────────────────────────────────────────────┐
│              RECURSIVE SELF-IMPROVEMENT LOOP                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐                                             │
│   │ 1. EXECUTE   │ → Run 10-min sprint                         │
│   └──────┬───────┘                                             │
│          ▼                                                     │
│   ┌──────────────┐                                             │
│   │ 2. VERIFY    │ → Check: build passing? tests passing?     │
│   └──────┬───────┘                                             │
│          ▼                                                     │
│   ┌──────────────┐                                             │
│   │ 3. IMPROVE   │ → Find 1 thing to improve, fix it          │
│   └──────┬───────┘                                             │
│          ▼                                                     │
│   ┌──────────────┐                                             │
│   │ 4. COMMIT    │ → Commit all improvements                  │
│   └──────┬───────┘                                             │
│          ▼                                                     │
│   ┌──────────────┐                                             │
│   │ 5. REPEAT    │ → Next 10-min sprint                        │
│   └──────────────┘                                             │
│                                                                 │
│   ⏱️  Each loop: 10 minutes                                     │
│   📈 Improvement: Compound over time                            │
│   🎯 Result: System gets better every cycle                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Usage

```bash
# Single 10-minute sprint
kimi-swarm-v3 "Refactor error handling in llm.ts"

# Self-improving sprint (adds extra improvements)
kimi-swarm-v3 "Add tests for autonomous-state.ts" --self-improve

# 5 parallel sprints
kimi-swarm-v3 --parallel 5 --tasks-file sprint-tasks.yaml

# Quick optimization sprint
kimi-swarm-v3 "Optimize build time by 20%" --timebox 5
```

---

## Metrics Dashboard

| Metric | Target | Current |
|--------|--------|---------|
| Sprint Duration | ≤10 min | _ |
| Build Passing | 100% | _ |
| Test Passing | 100% | _ |
| Commits/Sprint | ≥1 | _ |
| Self-Improvements/Sprint | ≥1 | _ |
| Parallel Efficiency | 5x | _ |

---

**Goal: System that continuously improves itself, 24/7, 10 minutes at a time.**
