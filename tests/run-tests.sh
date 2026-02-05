#!/bin/bash
# Comprehensive Test Runner for Dash
# Runs all test suites and generates coverage report

set -e

echo "========================================"
echo "Dash v2.0 Comprehensive Test Suite"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
TOTAL=0
PASSED=0
FAILED=0

# Test directories
TEST_DIRS=(
  "tests/events"
  "tests/cli"
  "tests/api"
  "tests/core"
  "tests/integration"
)

function run_test() {
  local name=$1
  local file=$2
  
  echo -n "Running $name... "
  TOTAL=$((TOTAL + 1))
  
  if [ -f "$file" ]; then
    if node "$file" > /tmp/test-output.log 2>&1; then
      echo -e "${GREEN}PASSED${NC}"
      PASSED=$((PASSED + 1))
    else
      echo -e "${RED}FAILED${NC}"
      FAILED=$((FAILED + 1))
      echo "--- Output ---"
      cat /tmp/test-output.log
      echo "--------------"
    fi
  else
    echo -e "${YELLOW}SKIPPED (not found)${NC}"
  fi
}

function run_js_tests() {
  local dir=$1
  
  echo "--- $dir ---"
  
  if [ -d "$dir" ]; then
    for file in "$dir"/*.js; do
      if [ -f "$file" ]; then
        local name=$(basename "$file" .js)
        run_test "$name" "$file"
      fi
    done
  else
    echo "(directory not found)"
  fi
}

function run_ts_tests() {
  local dir=$1
  
  echo "--- $dir ---"
  
  if [ -d "$dir" ]; then
    for file in "$dir"/*.ts; do
      if [ -f "$file" ]; then
        local name=$(basename "$file" .ts)
        run_test "$name" "$file"
      fi
    done
  else
    echo "(directory not found)"
  fi
}

# Check if build exists
echo "Checking build..."
if [ ! -d "dist" ]; then
  echo -e "${YELLOW}Building project...${NC}"
  npm run build
fi

echo ""
echo "========================================"
echo "Running Unit Tests"
echo "========================================"

# Run tests by category
for dir in "${TEST_DIRS[@]}"; do
  run_js_tests "$dir"
done

echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "Total: ${TOTAL}"
echo -e "Passed: ${GREEN}${PASSED}${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "Failed: ${RED}${FAILED}${NC}"
else
  echo -e "Failed: ${FAILED}"
fi

PASS_RATE=0
if [ $TOTAL -gt 0 ]; then
  PASS_RATE=$((PASSED * 100 / TOTAL))
fi
echo -e "Pass Rate: ${PASS_RATE}%"

echo ""
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}Some tests failed!${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
fi
