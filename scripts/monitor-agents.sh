#!/bin/bash
# Agent Pool Monitor Script
# Automatically maintains at least 10 active agents for beta maximization
# Usage: ./scripts/monitor-agents.sh [check|replenish|status]

set -e

GODEL_DIR="/Users/jasontang/clawd/projects/godel"
REPLENISH_THRESHOLD=5
TARGET_COUNT=10
LOG_FILE="$GODEL_DIR/logs/agent-monitor.log"

# Ensure log directory exists
mkdir -p "$GODEL_DIR/logs"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

count_active_agents() {
    cd "$GODEL_DIR"
    node dist/index.js agents list 2>/dev/null | grep -E "(idle|running|spawning)" | wc -l | tr -d ' '
}

get_agent_status() {
    cd "$GODEL_DIR"
    node dist/index.js agents list 2>/dev/null
}

spawn_agent() {
    local label="${1:-replenishment-agent}"
    cd "$GODEL_DIR"
    node dist/index.js agents spawn "Capacity maintenance agent" --label "$label-$(date +%s)"
}

check_and_replenish() {
    local current_count=$(count_active_agents)
    log "Current active agents: $current_count"
    
    if [ "$current_count" -lt "$REPLENISH_THRESHOLD" ]; then
        local needed=$((TARGET_COUNT - current_count))
        log "⚠️  Agent count ($current_count) below threshold ($REPLENISH_THRESHOLD). Spawning $needed agents..."
        
        for i in $(seq 1 $needed); do
            log "Spawning agent $i/$needed..."
            spawn_agent "capacity-agent"
            sleep 2  # Avoid rate limiting
        done
        
        log "✅ Replenishment complete. New count: $(count_active_agents)"
    else
        log "✅ Agent pool healthy ($current_count active)"
    fi
}

show_status() {
    echo "═══════════════════════════════════════════════════════════════"
    echo "              AGENT POOL STATUS REPORT"
    echo "═══════════════════════════════════════════════════════════════"
    echo "Target Count:      $TARGET_COUNT"
    echo "Replenish Threshold: $REPLENISH_THRESHOLD"
    echo "Current Count:     $(count_active_agents)"
    echo "───────────────────────────────────────────────────────────────"
    get_agent_status
    echo "═══════════════════════════════════════════════════════════════"
}

# Main command handler
case "${1:-check}" in
    check)
        check_and_replenish
        ;;
    replenish)
        log "🔄 Force replenishment triggered"
        for i in {1..10}; do
            spawn_agent "manual-capacity"
            sleep 2
        done
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 [check|replenish|status]"
        echo ""
        echo "Commands:"
        echo "  check      - Check agent count and replenish if below threshold (default)"
        echo "  replenish  - Force spawn 10 new agents"
        echo "  status     - Show detailed status report"
        exit 1
        ;;
esac
