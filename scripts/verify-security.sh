#!/bin/bash
# Security Hardening Verification Script
# Verifies security configurations and best practices

set -e

echo "=========================================="
echo "Security Hardening Verification"
echo "=========================================="

PASS=0
FAIL=0

# Check for HTTPS/TLS configuration
echo ""
echo "[1/6] Checking HTTPS/TLS configuration..."
if grep -r "https\|TLS\|SSL\|ssl" --include="*.yaml" --include="*.yml" --include="*.properties" --include="*.json" --include="*.env*" . 2>/dev/null | grep -qiE "https|tls|ssl"; then
    echo "  ✓ HTTPS/TLS configuration found"
    PASS=$((PASS + 1))
else
    echo "  ⚠ No HTTPS/TLS configuration detected"
    FAIL=$((FAIL + 1))
fi

# Check for authentication configuration
echo ""
echo "[2/6] Checking authentication configuration..."
if grep -r "auth\|jwt\|oauth\|bearer\|security" --include="*.yaml" --include="*.yml" --include="*.properties" --include="*.json" --include="*.java" --include="*.py" . 2>/dev/null | grep -qi "auth\|jwt\|oauth"; then
    echo "  ✓ Authentication configuration detected"
    PASS=$((PASS + 1))
else
    echo "  ⚠ No authentication configuration found"
    FAIL=$((FAIL + 1))
fi

# Check for secret management patterns
echo ""
echo "[3/6] Checking secret management..."
if grep -r "secret\|password\|api_key\|apikey\|credential" --include="*.yaml" --include="*.yml" --include="*.properties" --include="*.json" . 2>/dev/null | grep -qi "secret\|password\|api_key"; then
    echo "  ✓ Secret management patterns found"
    PASS=$((PASS + 1))
else
    echo "  ⚠ No secret management patterns detected"
    FAIL=$((FAIL + 1))
fi

# Check for encryption configuration
echo ""
echo "[4/6] Checking encryption configuration..."
if grep -r "encrypt\|decrypt\|cipher\|hash\|bcrypt\|sha" --include="*.yaml" --include="*.yml" --include="*.properties" --include="*.java" --include="*.py" . 2>/dev/null | grep -qi "encrypt\|hash\|cipher"; then
    echo "  ✓ Encryption configuration detected"
    PASS=$((PASS + 1))
else
    echo "  ⚠ No encryption configuration found"
    FAIL=$((FAIL + 1))
fi

# Check for CORS configuration
echo ""
echo "[5/6] Checking CORS configuration..."
if grep -r "cors\|CrossOrigin\|allowedOrigins" --include="*.yaml" --include="*.yml" --include="*.java" --include="*.ts" . 2>/dev/null | grep -qi "cors\|cross.*origin"; then
    echo "  ✓ CORS configuration detected"
    PASS=$((PASS + 1))
else
    echo "  ⚠ No CORS configuration found"
    FAIL=$((FAIL + 1))
fi

# Check for security headers
echo ""
echo "[6/6] Checking security headers configuration..."
if grep -r "X-Frame-Options\|X-Content-Type-Options\|Content-Security-Policy\|X-XSS-Protection" --include="*.yaml" --include="*.yml" --include="*.java" --include="*.properties" . 2>/dev/null | grep -qi "X-Frame\|X-Content\|Content-Security"; then
    echo "  ✓ Security headers configuration detected"
    PASS=$((PASS + 1))
else
    echo "  ⚠ No security headers found"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "=========================================="
echo "Security Summary: PASS=$PASS, FAIL=$FAIL"
echo "=========================================="

if [ $FAIL -gt 0 ]; then
    exit 1
fi
exit 0
