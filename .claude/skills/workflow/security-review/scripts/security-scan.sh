#!/bin/bash
ROOT="$(git rev-parse --show-toplevel)"
MOBILE="$ROOT/mobile"
FAIL=false

echo "=== Belific Security Scan ==="
echo ""

# 1. Hardcoded credentials
echo "--- Hardcoded credentials ---"
MATCHES=$(git grep -n -E "eyJhbGci|sk-ant-|SUPABASE_SERVICE_ROLE|password\s*=\s*['\"][^'\"]{8}" \
  -- ":(exclude)*.env*" ":(exclude)docs/" ":(exclude)*.md" ":(exclude).claude/" 2>/dev/null || true)
if [ -n "$MATCHES" ]; then
  echo "❌ FAIL:"
  echo "$MATCHES"
  FAIL=true
else
  echo "✅ No hardcoded credentials"
fi
echo ""

# 2. Sensitive console.log in mobile TypeScript
echo "--- Sensitive console.log ---"
LOGS=$(grep -rn "console\.log" --include="*.ts" --include="*.tsx" \
  "$MOBILE/app" "$MOBILE/lib" 2>/dev/null \
  | grep -v "node_modules/" \
  | grep -iE "key|token|secret|password" \
  | grep -v "!!" || true)
if [ -n "$LOGS" ]; then
  echo "❌ FAIL:"
  echo "$LOGS"
  FAIL=true
else
  echo "✅ No sensitive console.log"
fi
echo ""

# 3. TypeScript as any in mobile
echo "--- TypeScript 'as any' ---"
ANY=$(grep -rn " as any" --include="*.ts" --include="*.tsx" \
  "$MOBILE/app" "$MOBILE/lib" 2>/dev/null \
  | grep -v "node_modules/" || true)
if [ -n "$ANY" ]; then
  echo "❌ FAIL:"
  echo "$ANY"
  FAIL=true
else
  echo "✅ Zero 'as any'"
fi
echo ""

# 4. Staged .env files
echo "--- Staged .env files ---"
STAGED=$(git diff --cached --name-only | grep -E "\.env" || true)
if [ -n "$STAGED" ]; then
  echo "❌ FAIL: .env file staged:"
  echo "$STAGED"
  FAIL=true
else
  echo "✅ No .env files staged"
fi
echo ""

echo "==========================="
if [ "$FAIL" = true ]; then
  echo "RESULT: ❌ SECURITY SCAN FAILED"
  exit 1
else
  echo "RESULT: ✅ SECURITY SCAN PASSED"
fi
