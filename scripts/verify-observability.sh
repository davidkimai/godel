#!/bin/bash
# Observability Verification Script
# Verifies health checks, metrics, and tracing configurations

set -e

echo "=========================================="
echo "Observability Verification"
echo "=========================================="

PASS=0
FAIL=0

# Check for health check endpoints
echo ""
echo "[1/5] Checking health check endpoints..."
if grep -r "health\|actuator\|/health\|isAlive\|liveness\|readiness" --include="*.yaml" --include="*.yml" --include="*.properties" --include="*.java" --include="*.ts" --include="*.py" . 2>/dev/null | grep -qi "health\|actuator\|liveness\|readiness"; then
    echo "  ✓ Health check configuration found"
    PASS=$((PASS + 1))
else
    echo "  ⚠ No health check configuration detected"
    FAIL=$((FAIL + 1))
fi

# Check for metrics configuration
echo ""
echo "[2/5] Checking metrics configuration..."
if grep -r "metrics\|prometheus\|datadog\|grafana\|micrometer" --include="*.yaml" --include="*.yml" --include="*.properties" --include="*.json" --include="*.java" . 2>/dev/null | grep -qi "metrics\|prometheus\|micrometer"; then
    echo "  ✓ Metrics configuration detected"
    PASS=$((PASS + 1))
else
    echo "  ⚠ No metrics configuration found"
    FAIL=$((FAIL + 1))
fi

# Check for tracing configuration
echo ""
echo "[3/5] Checking tracing configuration..."
if grep -r "trace\|tracing\|openzipkin\|jaeger\|opentelemetry\|zipkin" --include="*.yaml" --include="*.yml" --include="*.properties" --include="*.json" --include="*.java" . 2>/dev/null | grep -qi "trace\|tracing\|zipkin\|jaeger"; then
    echo "  ✓ Tracing configuration detected"
    PASS=$((PASS + 1))
else
    echo "  ⚠ No tracing configuration found"
    FAIL=$((FAIL + 1))
fi

# Check for logging configuration
echo ""
echo "[4/5] Checking logging configuration..."
if grep -r "log level\|logging\|logback\|log4j\|logger" --include="*.yaml" --include="*.yml" --include="*.properties" --include="*.json" --include="*.xml" . 2>/dev/null | grep -qi "log\|logger"; then
    echo "  ✓ Logging configuration detected"
    PASS=$((PASS + 1))
else
    echo "  ⚠ No logging configuration found"
    FAIL=$((FAIL + 1))
fi

# Check for distributed tracing headers
echo ""
echo "[5/5] Checking distributed tracing headers..."
if grep -r "X-B3-TraceId\|traceparent\|W3C-Traceparent\|correlation" --include="*.yaml" --include="*.yml" --include="*.java" --include="*.ts" --include="*.py" . 2>/dev/null | grep -qi "X-B3\|traceparent\|correlation"; then
    echo "  ✓ Distributed tracing headers detected"
    PASS=$((PASS + 1))
else
    echo "  ⚠ No distributed tracing headers found"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "=========================================="
echo "Observability Summary: PASS=$PASS, FAIL=$FAIL"
echo "=========================================="

if [ $FAIL -gt 0 ]; then
    exit 1
fi
exit 0
