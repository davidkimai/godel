#!/bin/bash
# Circuit Breaker Verification Script
# Verifies circuit breaker implementation and configuration

set -e

echo "=========================================="
echo "Circuit Breaker Verification"
echo "=========================================="

PASS=0
FAIL=0

# Check for circuit breaker configuration files
echo ""
echo "[1/4] Checking circuit breaker configuration..."
if find . -name "*circuit*breaker*" -o -name "*resilience*" 2>/dev/null | grep -q .; then
    echo "  ✓ Circuit breaker configuration files found"
    PASS=$((PASS + 1))
else
    echo "  ⚠ No dedicated circuit breaker files (checking config patterns)"
    FAIL=$((FAIL + 1))
fi

# Check for circuit breaker annotations/patterns in code
echo ""
echo "[2/4] Checking for circuit breaker patterns in code..."
if grep -r "@CircuitBreaker\|@ Resilience\|CircuitBreaker" --include="*.java" --include="*.py" --include="*.ts" --include="*.go" . 2>/dev/null | grep -q .; then
    echo "  ✓ Circuit breaker annotations detected"
    PASS=$((PASS + 1))
else
    echo "  ⚠ No circuit breaker annotations found"
    FAIL=$((FAIL + 1))
fi

# Check circuit breaker properties/configuration
echo ""
echo "[3/4] Checking circuit breaker configuration properties..."
if grep -r "failureRateThreshold\|waitDurationInOpenState\|slidingWindowSize" --include="*.yaml" --include="*.yml" --include="*.properties" --include="*.json" . 2>/dev/null | grep -q .; then
    echo "  ✓ Circuit breaker properties configured"
    PASS=$((PASS + 1))
else
    echo "  ⚠ Circuit breaker properties not found in config"
    FAIL=$((FAIL + 1))
fi

# Check for fallback implementations
echo ""
echo "[4/4] Checking fallback implementations..."
if grep -r "@Fallback\|fallbackMethod" --include="*.java" --include="*.py" --include="*.ts" --include="*.go" . 2>/dev/null | grep -q .; then
    echo "  ✓ Fallback implementations detected"
    PASS=$((PASS + 1))
else
    echo "  ⚠ No fallback implementations found"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "=========================================="
echo "Circuit Breaker Summary: PASS=$PASS, FAIL=$FAIL"
echo "=========================================="

if [ $FAIL -gt 0 ]; then
    exit 1
fi
exit 0
