#!/bin/bash
# Recursive Dash Improvement Swarms
# Uses Kimi K2.5 CLI for recursive improvement

set -e

DASH_DIR="/Users/jasontang/clawd/projects/dash"
LOG_DIR="$DASH_DIR/.dash/logs"
mkdir -p "$LOG_DIR"

echo "🚀 Launching K2.5 Recursive Improvement Swarms..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Swarm 1: Test Coverage Improvement
echo "📊 Swarm 1: Test Coverage (Target: 2.2% → 10%)"
(
  cd "$DASH_DIR"
  kimi -p "Analyze test coverage in /Users/jasontang/clawd/projects/dash. Currently at 2.2%. Identify 5 highest-impact modules without tests. Write comprehensive tests for: decision-engine, swarm-executor, bug-monitor. Run 'npm test' after writing each test file to verify 0 errors. Report coverage improvement."
) > "$LOG_DIR/swarm-testing-$(date +%s).log" 2>&1 &
SWARM1_PID=$!
echo "  → PID $SWARM1_PID"

sleep 3

# Swarm 2: Code Quality & TypeScript Errors  
echo "🔧 Swarm 2: Code Quality (Fix TypeScript Errors)"
(
  cd "$DASH_DIR"
  kimi -p "Run 'npm run build' in /Users/jasontang/clawd/projects/dash to find TypeScript errors. Fix all errors. After each fix, verify build passes. Document fixes in memory."
) > "$LOG_DIR/swarm-quality-$(date +%s).log" 2>&1 &
SWARM2_PID=$!
echo "  → PID $SWARM2_PID"

sleep 3

# Swarm 3: Documentation
echo "📚 Swarm 3: Documentation Update"
(
  cd "$DASH_DIR"
  kimi -p "Update README.md in /Users/jasontang/clawd/projects/dash with complete documentation: 1) All 10 autonomy modules (decision-engine, swarm-executor, bug-monitor, etc), 2) CLI commands, 3) Usage examples. Add JSDoc comments to all exported functions in src/core/ modules."
) > "$LOG_DIR/swarm-docs-$(date +%s).log" 2>&1 &
SWARM3_PID=$!
echo "  → PID $SWARM3_PID"

sleep 3

# Swarm 4: Recursive Bug Monitor
echo "🐛 Swarm 4: Bug Monitor & Health Checks"
(
  cd "$DASH_DIR"
  kimi -p "Monitor Dash project for issues: 1) Run 'npm run build' to check for errors, 2) Run 'node dist/index.js agents list' to check stuck agents, 3) Check logs in .dash/logs/ for errors, 4) Identify and report any bugs found. Create bug reports for issues."
) > "$LOG_DIR/swarm-monitor-$(date +%s).log" 2>&1 &
SWARM4_PID=$!
echo "  → PID $SWARM4_PID"

sleep 3

# Swarm 5: Performance Optimization
echo "⚡ Swarm 5: Performance Analysis"
(
  cd "$DASH_DIR"
  kimi -p "Analyze performance in /Users/jasontang/clawd/projects/dash: 1) Agent spawning issues (agents stuck in 'spawning'), 2) Database query performance, 3) Event bus latency, 4) Context compression speed. Identify top 3 bottlenecks and suggest optimizations."
) > "$LOG_DIR/swarm-perf-$(date +%s).log" 2>&1 &
SWARM5_PID=$!
echo "  → PID $SWARM5_PID"

echo ""
echo "✅ 5 K2.5 Swarms Launched!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Swarm Status:"
echo "  Swarm 1 (Testing):       PID $SWARM1_PID"
echo "  Swarm 2 (Quality):       PID $SWARM2_PID"
echo "  Swarm 3 (Docs):          PID $SWARM3_PID"
echo "  Swarm 4 (Monitor):       PID $SWARM4_PID"
echo "  Swarm 5 (Performance):   PID $SWARM5_PID"
echo ""
echo "📁 Logs: $LOG_DIR/"
echo ""
echo "To monitor progress:"
echo "  tail -f $LOG_DIR/swarm-*.log"
echo ""
echo "To check running swarms:"
echo "  ps aux | grep kimi"
echo ""
