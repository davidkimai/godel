# Swarm Protocol v2 - Continuous Execution with Commit Discipline

**Version:** 2.0.0  
**Date:** 2026-02-03  
**Purpose:** Prevent idle autonomous cycles, ensure continuous work delivery

---

## Core Principles

1. **Commit-First Discipline** - No success without git proof
2. **Continuous Cycles** - Complete subtasks, spawn next, repeat
3. **Build on Each Other** - Each cycle advances the previous work
4. **Verify Deliverables** - Check files exist AND are committed

---

## Swarm Template v2

```yaml
name: "{swarm_name}"
version: "2.0.0"
mode: continuous

anti_stub:
  require_commit: true
  verify_files: true
  verify_git: true
  
phases:
  - name: research
    tasks:
      - analyze_source
      - document_findings
      - commit_findings
      
  - name: implementation  
    tasks:
      - implement_feature
      - write_tests
      - commit_implementation
      
  - name: verification
    tasks:
      - run_build
      - run_tests
      - report_results
```

---

## Anti-Stub Protocol (CRITICAL)

### Before Reporting Success:

```bash
# 1. Verify files exist
ls -la $OUTPUT_DIR/*.md

# 2. Verify git status
git status --short

# 3. Verify commits
git log --oneline -1

# 4. Commit if needed
git add $OUTPUT_DIR/
git commit -m "feat: $(cat $OUTPUT_DIR/summary.txt)"

# 5. Report with proof
echo "✅ COMPLETED"
echo "Files: $(ls $OUTPUT_DIR/*.md | wc -l)"
echo "Commit: $(git log -1 --format='%H')"
```

### Swarm Exit Criteria

```
REQUIRES ALL OF:
├── Files created in $OUTPUT_DIR/
├── Files git added AND committed
├── Test file created (if implementing)
└── npm run build passes (if code changes)
```

---

## Continuous Execution Loop

```javascript
// SWARM TEMPLATE (Kimi/Python)

async function run_swarm_v2(task_definition) {
  const cycle = 1
  const max_cycles = 100
  
  while (cycle <= max_cycles) {
    console.log(`🔄 CYCLE ${cycle}`)
    
    // 1. DO WORK
    const result = await execute_task(task_definition)
    
    // 2. VERIFY DELIVERABLES
    const files_created = list_output_files()
    const has_changes = git_status_has_changes()
    
    if (files_created.length === 0) {
      console.log("⚠️  No files created - investigating...")
      await investigate_and_recover()
    }
    
    // 3. COMMIT (REQUIRED!)
    if (has_changes || files_created.length > 0) {
      await commit_changes(`cycle ${cycle}: ${task_definition.summary}`)
      console.log("✅ Committed cycle output")
    }
    
    // 4. BUILD ON PREVIOUS
    if (cycle > 1) {
      const previous_work = get_previous_cycle_output()
      await build_on(previous_work)
    }
    
    // 5. SPAWN NEXT OR COMPLETE
    const next_task = await determine_next_task(task_definition)
    if (next_task) {
      task_definition = next_task
      cycle++
      continue
    } else {
      console.log("🎉 SWARM COMPLETE - All subtasks done")
      break
    }
  }
  
  return summarize_cycles(cycle)
}
```

---

## Kimi Swarm v2 Implementation

```python
#!/usr/bin/env python3
"""
Kimi Swarm v2 - Continuous Execution with Commit Discipline

Usage:
  kimi-swarm-v2 "Your task here"
  
This version:
- Requires commits before reporting success
- Runs continuous cycles until complete
- Builds on previous work
- Verifies all deliverables
"""

import subprocess
import json
import os
from datetime import datetime
from pathlib import Path

class KimiSwarmV2:
    def __init__(self, task: str, output_dir: str = None):
        self.task = task
        self.output_dir = output_dir or f".swarm-outputs/{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        self.cycle = 1
        self.max_cycles = 50
        
        # Create output directory
        Path(self.output_dir).mkdir(parents=True, exist_ok=True)
        
    async def run(self):
        """Execute continuous swarm cycles."""
        print(f"🚀 Starting Swarm v2: {self.task}")
        
        while self.cycle <= self.max_cycles:
            print(f"\n{'='*60}")
            print(f"🔄 CYCLE {self.cycle}/{self.max_cycles}")
            print(f"{'='*60}")
            
            # 1. Execute task
            result = await self.execute_task()
            
            # 2. Verify deliverables
            files = self.list_output_files()
            if not files:
                await self.investigate_and_recover()
            
            # 3. COMMIT (REQUIRED!)
            commit_result = await self.commit_if_needed()
            
            # 4. Report cycle completion
            print(f"\n📊 Cycle {self.cycle} Summary:")
            print(f"   Files: {len(files)}")
            print(f"   Commit: {commit_result.get('hash', 'none')[:8] if commit_result else 'none'}")
            
            # 5. Determine next step
            next_task = await self.determine_next_task()
            if not next_task:
                print(f"\n🎉 Swarm complete after {self.cycle} cycles!")
                return self.summarize()
            
            self.task = next_task
            self.cycle += 1
        
        print(f"\n⚠️  Max cycles ({self.max_cycles}) reached")
        return self.summarize()
    
    async def execute_task(self):
        """Execute the current task using Kimi."""
        task_file = f"{self.output_dir}/cycle-{self.cycle}-task.md"
        output_file = f"{self.output_dir}/cycle-{self.cycle}-output.md"
        
        # Write task definition
        with open(task_file, 'w') as f:
            f.write(f"# Task (Cycle {self.cycle})\n\n{self.task}\n")
        
        # Execute via Kimi
        result = subprocess.run(
            ['kimi', '-p', f'''You are a {self.task}. Output to {output_file}. 
            CRITICAL: After completing your work, you MUST:
            1. Create output files in {self.output_dir}/
            2. Run: git add {self.output_dir}/
            3. Run: git commit -m "cycle {self.cycle}: completed subtask"
            Do not report success until you have committed!'''],
            capture_output=True, text=True
        )
        
        return result
    
    async def commit_if_needed(self):
        """Verify and commit any changes."""
        # Check for changes
        status = subprocess.run(
            ['git', 'status', '--short', self.output_dir],
            capture_output=True, text=True
        )
        
        if not status.stdout.strip():
            print("   (No changes to commit)")
            return None
        
        # Commit
        commit = subprocess.run(
            ['git', 'add', self.output_dir],
            capture_output=True, text=True
        )
        
        commit_msg = f"cycle {self.cycle}: {self.task[:50]}..."
        commit_result = subprocess.run(
            ['git', 'commit', '-m', commit_msg],
            capture_output=True, text=True
        )
        
        # Get commit hash
        hash_result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            capture_output=True, text=True
        )
        
        return {'hash': hash_result.stdout.strip()}
    
    def list_output_files(self):
        """List output files in cycle directory."""
        cycle_dir = f"{self.output_dir}/cycle-{self.cycle}"
        if not Path(cycle_dir).exists():
            return []
        return list(Path(cycle_dir).glob('*'))
    
    async def investigate_and_recover(self):
        """Investigate why no files created and recover."""
        print("   ⚠️  No files created - investigating...")
        
        # Check if task is complete
        response = input("   Task appears complete? (y/n): ")
        if response.lower() == 'y':
            await self.commit_if_needed()
            return
        
        # Try alternative approach
        print("   🔄 Trying alternative approach...")
    
    async def determine_next_task(self):
        """Determine if there's more work or we're done."""
        # Check if subtask list exists
        subtasks_file = f"{self.output_dir}/subtasks.json"
        if not Path(subtasks_file).exists():
            return None  # Done
        
        with open(subtasks_file) as f:
            subtasks = json.load(f)
        
        if self.cycle < len(subtasks):
            return subtasks[self.cycle]
        
        return None  # All subtasks complete
    
    def summarize(self):
        """Summarize swarm execution."""
        total_files = len(list(Path(self.output_dir).glob('**/*')))
        
        commits = subprocess.run(
            ['git', 'log', '--oneline', f'--since={datetime.now().strftime("%Y-%m-%d %H:%M:%S")}', '--', self.output_dir],
            capture_output=True, text=True
        )
        commit_count = len(commits.stdout.strip().split('\n')) if commits.stdout.strip() else 0
        
        return {
            'cycles': self.cycle,
            'total_files': total_files,
            'commits': commit_count,
            'output_dir': self.output_dir
        }


# CLI Entry Point
if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: kimi-swarm-v2 'Your task here'")
        sys.exit(1)
    
    task = ' '.join(sys.argv[1:])
    swarm = KimiSwarmV2(task)
    result = asyncio.run(swarm.run())
    
    print(f"\n{'='*60}")
    print("📊 SWARM SUMMARY")
    print(f"{'='*60}")
    print(f"Cycles: {result['cycles']}")
    print(f"Files: {result['total_files']}")
    print(f"Commits: {result['commits']}")
```

---

## Usage

```bash
# Start a continuous swarm
kimi-swarm-v2 "Research pi-mono architecture patterns"

# Monitor progress
git log --oneline --all -- "swarm-outputs/"

# Verify continuous work
git log --since="1 hour ago" --oneline
```

---

## Failure Recovery

If swarm detects no commits for 2 hours:
1. Log alert: "⚠️  No commits in 2 hours"
2. Attempt self-diagnosis
3. If stuck, mark as "NEEDS_HUMAN"
4. Continue monitoring

---

## Metrics to Track

| Metric | Target | Alert If |
|--------|--------|----------|
| Commits per hour | ≥ 2 | < 1 |
| Files per cycle | ≥ 1 | 0 |
| Build passing | 100% | < 100% |
| Cycle completion | 100% | stuck |

---

**This protocol ensures autonomous swarms continuously deliver value, not just process uptime.**
