#!/bin/bash
# Production Readiness Check Script
# Runs every 15 minutes to verify progress

PROJECT_DIR="/Users/jasontang/clawd/projects/dash"
REPORT_FILE="/tmp/dash-readiness-check-$(date +%Y%m%d-%H%M).log"

echo "=== DASH PRODUCTION READINESS CHECK ===" > "$REPORT_FILE"
echo "Timestamp: $(date)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

cd "$PROJECT_DIR"

# Check 1: Git Status
echo "## 1. Git Status" >> "$REPORT_FILE"
git status --short >> "$REPORT_FILE" 2>&1
UNCOMMITTED=$(git status --short | wc -l)
echo "Uncommitted files: $UNCOMMITTED" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Check 2: File Existence
echo "## 2. Critical File Existence" >> "$REPORT_FILE"
FILES=(
  "src/utils/circuit-breaker.ts"
  "src/storage/sql-security.ts"
  "src/api/middleware/redis-rate-limit.ts"
  "src/utils/graceful-shutdown.ts"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    SIZE=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
    echo "✅ $file (${SIZE} bytes)" >> "$REPORT_FILE"
  else
    echo "❌ $file MISSING" >> "$REPORT_FILE"
  fi
done
echo "" >> "$REPORT_FILE"

# Check 3: Console Statements
echo "## 3. Console Statement Count" >> "$REPORT_FILE"
CONSOLE_COUNT=$(grep -r "console\." src/ --include="*.ts" | wc -l)
echo "Console statements: $CONSOLE_COUNT" >> "$REPORT_FILE"
if [ "$CONSOLE_COUNT" -gt 0 ]; then
  echo "⚠️  Still has console statements" >> "$REPORT_FILE"
fi
echo "" >> "$REPORT_FILE"

# Check 4: Hardcoded Credentials
echo "## 4. Hardcoded Credentials Check" >> "$REPORT_FILE"
if grep -r "password.*=" docker-compose.yml monitoring/docker-compose.yml 2>/dev/null | grep -v "^#" | grep -q "="; then
  echo "⚠️  Potential hardcoded credentials found" >> "$REPORT_FILE"
  grep -r "password.*=" docker-compose.yml monitoring/docker-compose.yml 2>/dev/null | head -5 >> "$REPORT_FILE"
else
  echo "✅ No hardcoded credentials detected" >> "$REPORT_FILE"
fi
echo "" >> "$REPORT_FILE"

# Check 5: Bcrypt Simulator
echo "## 5. Bcrypt Simulator Check" >> "$REPORT_FILE"
if grep -r "BcryptSimulator" src/ --include="*.ts" 2>/dev/null; then
  echo "❌ BcryptSimulator still in use" >> "$REPORT_FILE"
else
  echo "✅ No BcryptSimulator found" >> "$REPORT_FILE"
fi
echo "" >> "$REPORT_FILE"

# Check 6: Test Status
echo "## 6. Test Status" >> "$REPORT_FILE"
if npm test 2>&1 | tail -20 >> "$REPORT_FILE"; then
  echo "✅ Tests passing" >> "$REPORT_FILE"
else
  echo "❌ Tests failing" >> "$REPORT_FILE"
fi
echo "" >> "$REPORT_FILE"

# Summary
echo "## Summary" >> "$REPORT_FILE"
echo "Uncommitted: $UNCOMMITTED files" >> "$REPORT_FILE"
echo "Console statements: $CONSOLE_COUNT" >> "$REPORT_FILE"

# Alert if critical issues
if [ "$UNCOMMITTED" -gt 10 ] || [ "$CONSOLE_COUNT" -gt 100 ]; then
  echo "🚨 CRITICAL: Production readiness issues detected" >> "$REPORT_FILE"
  # Could send alert here
fi

echo "Report saved to: $REPORT_FILE"
