#!/bin/bash
# Dash v2.0 Autonomous System Startup Script
# Launch all monitors and ensure continuous operation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/.dash/logs"
PID_DIR="${SCRIPT_DIR}/.dash/pids"

# Setup directories
mkdir -p "$LOG_DIR"
mkdir -p "$PID_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_DIR/startup.log"
}

log "=== Starting Dash v2.0 Autonomous System ==="

# Function to start a monitor in background
start_monitor() {
    local name=$1
    local script=$2
    
    if [ -f "$script" ]; then
        log "Starting $name..."
        node "$script" > "$LOG_DIR/${name}.log" 2>&1 &
        echo $! > "$PID_DIR/${name}.pid"
        log "$name started (PID: $(cat "$PID_DIR/${name}.pid"))"
    else
        log "WARNING: $script not found, skipping $name"
    fi
}

# Kill any existing processes
log "Cleaning up existing processes..."
pkill -f "build-monitor.js" 2>/dev/null || true
pkill -f "error-watcher.js" 2>/dev/null || true
pkill -f "health-check.js" 2>/dev/null || true
pkill -f "autonomous-system.js" 2>/dev/null || true

# Start monitors (when they exist)
log "Starting monitors..."
start_monitor "build-monitor" "$SCRIPT_DIR/scripts/build-monitor.js"
start_monitor "error-watcher" "$SCRIPT_DIR/scripts/error-watcher.js"
start_monitor "health-check" "$SCRIPT_DIR/scripts/health-check.js"

# If autonomous-system.js exists, use it as master launcher
if [ -f "$SCRIPT_DIR/scripts/autonomous-system.js" ]; then
    log "Starting autonomous-system.js as master launcher..."
    node "$SCRIPT_DIR/scripts/autonomous-system.js" > "$LOG_DIR/autonomous-system.log" 2>&1 &
    echo $! > "$PID_DIR/autonomous-system.pid"
    log "Autonomous system started (PID: $(cat "$PID_DIR/autonomous-system.pid"))"
fi

log "=== Startup Complete ==="
log "All monitors running in background"
log "Check logs in: $LOG_DIR"

# Show status
echo ""
echo "=== Active PIDs ==="
ls -la "$PID_DIR/"*.pid 2>/dev/null | awk '{print $NF}' | xargs -I{} sh -c 'echo "  $(basename {} .pid): $(cat {})"'

echo ""
echo "=== Quick Commands ==="
echo "  View logs:     tail -f $LOG_DIR/*.log"
echo "  Check status:  node $SCRIPT_DIR/scripts/health-check.js"
echo "  Stop all:      pkill -f 'dash.*monitor' || pkill -f 'autonomous-system'"
