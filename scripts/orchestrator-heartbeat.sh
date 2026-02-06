#!/bin/bash
# Godel Orchestrator Heartbeat - Runs every 15 minutes
# Pings K2.5 to check on swarms and orchestrate improvements

set -e

GODEL_DIR="/Users/jasontang/clawd/projects/godel"
LOG_DIR="$GODEL_DIR/.godel/logs"
HEARTBEAT_STATE="$GODEL_DIR/.godel/heartbeat-state.json"

mkdir -p "$LOG_DIR"

# Initialize state file if doesn't exist
if [ ! -f "$HEARTBEAT_STATE" ]; then
  echo '{"lastCheck":0,"swarmCount":0,"issuesFound":0}' > "$HEARTBEAT_STATE"
fi

TIMESTAMP=$(date +%s)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔔 HEARTBEAT: $(date '+%Y-%m-%d %H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check running swarms
SWARM_COUNT=$(ps aux | grep "kimi -p" | grep -v grep | wc -l | tr -d ' ')
echo "📊 Active Swarms: $SWARM_COUNT"

# Check Godel system status
cd "$GODEL_DIR"
echo "🔍 Checking Godel Status..."

# Use K2.5 as orchestrator to check and manage swarms
kimi -p "You are the primary orchestrator for Godel v2.0 autonomous system.

CURRENT STATUS:
- Active K2.5 swarms: $SWARM_COUNT
- Location: /Users/jasontang/clawd/projects/godel

YOUR ORCHESTRATION TASKS:

1. CHECK SWARM HEALTH:
   - List running swarms: ps aux | grep kimi
   - Check if any swarms have completed
   - Review logs: ls -lh .godel/logs/*.log
   - Identify any stuck or failed swarms

2. REVIEW PROGRESS:
   - Run 'npm run build' to check for TypeScript errors
   - Run 'npm test' to check test coverage
   - Check 'node dist/index.js agents list' for stuck agents
   - Review recent log files for errors

3. ORCHESTRATE NEXT ACTIONS:
   - If swarms < 3: Launch new improvement swarms
   - If tests failing: Spawn debug swarm
   - If build broken: Spawn fix swarm
   - If coverage < 10%: Spawn test swarm
   - If agents stuck: Spawn diagnostics swarm

4. REPORT STATUS:
   - Summarize what swarms are doing
   - List any issues found
   - Recommend next orchestration actions
   - Estimate time to completion

Be proactive. If you see issues, spawn swarms to fix them.
Use the launch-k25-swarms.sh script if needed.

RESPOND WITH:
- Current swarm status summary
- Issues found (if any)
- Actions taken or recommended
- Next checkpoint ETA (15 min)" > "$LOG_DIR/orchestrator-$(date +%s).log" 2>&1

# Update heartbeat state
echo "{\"lastCheck\":$TIMESTAMP,\"swarmCount\":$SWARM_COUNT,\"timestamp\":\"$(date '+%Y-%m-%d %H:%M:%S')\"}" > "$HEARTBEAT_STATE"

echo ""
echo "✅ Heartbeat Complete"
echo "📁 Log: $LOG_DIR/orchestrator-$TIMESTAMP.log"
echo "⏰ Next heartbeat in 15 minutes"
echo ""
