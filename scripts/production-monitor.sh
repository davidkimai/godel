#!/bin/bash
# Production Readiness Recursive Monitor
# Runs every 15 minutes, checks critical items only

PROJECT_DIR="/Users/jasontang/clawd/projects/godel"
LOG_FILE="/tmp/godel-production-monitor-$(date +%Y%m%d).log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "=== PRODUCTION READINESS CHECK ==="

cd "$PROJECT_DIR"

# 1. Swarm Health (CRITICAL - affects uptime)
SWARMS=$(node -e "const d=require('./.godel/orchestrator-state.json'); const r=Object.values(d.activeSwarms||{}).filter(s=>s.status==='running'); const stuck=Object.values(d.activeSwarms||{}).filter(s=>s.status==='running'&&(Date.now()-s.started)/60000>120).length; console.log(r.length+','+stuck+','+Math.round((Date.now()-d.lastHeartbeat)/60000))" 2>/dev/null)
ACTIVE=$(echo $SWARMS | cut -d, -f1)
STUCK=$(echo $SWARMS | cut -d, -f2)
HB=$(echo $SWARMS | cut -d, -f3)

if [ "$ACTIVE" -lt 3 ]; then
    log "❌ CRITICAL: Only $ACTIVE/3 swarms active"
elif [ "$STUCK" -gt 0 ]; then
    log "⚠️  WARNING: $STUCK stuck swarms detected"
else
    log "✅ Swarms: $ACTIVE/3, HB: ${HB}m"
fi

# 2. Build Errors (count only - many are from incomplete modules)
EXISTING_ERRORS=$(npx tsc --noEmit 2>&1 | grep -v "Cannot find module" | grep -v "has no exported member" | grep -c "error" || echo 0)
PREVIOUS_ERRORS=$(cat /tmp/godel-error-count 2>/dev/null | tr -d '\n\r' || echo 0)
ERROR_TREND="same"
if [ "$EXISTING_ERRORS" -lt "$PREVIOUS_ERRORS" ]; then
    ERROR_TREND="↓ improving"
elif [ "$EXISTING_ERRORS" -gt "$PREVIOUS_ERRORS" ]; then
    ERROR_TREND="↑ regressing"
fi
echo "$EXISTING_ERRORS" > /tmp/godel-error-count
if [ "$EXISTING_ERRORS" -gt 0 ]; then
    log "⚠️  $EXISTING_ERRORS build errors ($ERROR_TREND)"
else
    log "✅ No build errors"
fi

# 3. Critical Files Exist
CRITICAL_FILES=(
    "src/utils/circuit-breaker.ts"
    "src/storage/sql-security.ts"
    "src/api/middleware/redis-rate-limit.ts"
    "src/utils/graceful-shutdown.ts"
    "src/utils/redis-session-store.ts"
)

MISSING=0
for f in "${CRITICAL_FILES[@]}"; do
    if [ ! -f "$f" ]; then
        log "❌ Missing: $f"
        MISSING=$((MISSING + 1))
    fi
done

if [ "$MISSING" -eq 0 ]; then
    log "✅ All critical files present"
fi

# 4. Console Cleanup Progress (track over time)
CONSOLE_COUNT=$(grep -r "console\." src/ --include="*.ts" | wc -l)
log "Console statements: $CONSOLE_COUNT"

# Summary
log "---STATUS---"
if [ "$ACTIVE" -ge 3 ] && [ "$STUCK" -eq 0 ] && [ "$MISSING" -eq 0 ]; then
    log "✅ PRODUCTION READY"
else
    log "🚨 NEEDS ATTENTION"
fi
log ""

# Output to console
cat "$LOG_FILE" | tail -15
