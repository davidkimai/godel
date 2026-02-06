#!/bin/bash
# Swarm Watchdog - Ensures minimum swarm count
# Runs every 30 minutes to maintain active swarms

GODEL_DIR="/Users/jasontang/clawd/projects/godel"
MIN_SWARMS=3
MAX_SWARMS=8

cd "$GODEL_DIR"

SWARM_COUNT=$(ps aux | grep "kimi -p" | grep -v grep | wc -l | tr -d ' ')

echo "🔍 Swarm Watchdog Check: $(date '+%Y-%m-%d %H:%M:%S')"
echo "   Active Swarms: $SWARM_COUNT / Min: $MIN_SWARMS / Max: $MAX_SWARMS"

if [ "$SWARM_COUNT" -lt "$MIN_SWARMS" ]; then
  echo "⚠️  Below minimum swarm count! Relaunching..."
  bash "$GODEL_DIR/scripts/launch-k25-swarms.sh"
  echo "✅ Swarms relaunched"
elif [ "$SWARM_COUNT" -gt "$MAX_SWARMS" ]; then
  echo "⚠️  Too many swarms! Consider consolidation."
else
  echo "✅ Swarm count healthy"
fi
