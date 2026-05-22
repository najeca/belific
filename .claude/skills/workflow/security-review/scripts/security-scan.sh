#!/bin/bash
ROOT="$(git rev-parse --show-toplevel)"
FAIL=false

echo "=== Landis Security Scan ==="
echo ""

# 1. Hardcoded credentials in tracked files
# Matches JWT tokens (eyJ) and Anthropic keys (sk-ant-) but excludes process.env reads
echo "--- Hardcoded credentials ---"
MATCHES=$(git grep -n -E "eyJhbGci|sk-ant-" \
  -- ":(exclude)*.env*" ":(exclude)docs/" ":(exclude)*.md" ":(exclude)create-issues.sh" ":(exclude).claude/" 2>/dev/null || true)
if [ -n "$MATCHES" ]; then
  echo "❌ FAIL:"
  echo "$MATCHES"
  FAIL=true
else
  echo "✅ No hardcoded credentials"
fi
echo ""

# 2. Sensitive console.log (excludes node_modules, .next build output, and boolean-only logs)
echo "--- Sensitive console.log ---"
LOGS=$(grep -rn "console\.log" --include="*.ts" --include="*.tsx" --include="*.js" \
  "$ROOT/apps" "$ROOT/packages" 2>/dev/null \
  | grep -v "node_modules/" \
  | grep -v "\.next/" \
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

# 3. TypeScript as any (excludes node_modules)
echo "--- TypeScript 'as any' ---"
ANY=$(grep -rn " as any" --include="*.ts" --include="*.tsx" \
  "$ROOT/apps" "$ROOT/packages" 2>/dev/null \
  | grep -v "node_modules/" || true)
if [ -n "$ANY" ]; then
  echo "❌ FAIL:"
  echo "$ANY"
  FAIL=true
else
  echo "✅ Zero 'as any'"
fi
echo ""

# 4. eas.json credentials
echo "--- eas.json credentials ---"
if grep -qE "SUPABASE|ANTHROPIC|API_KEY" "$ROOT/apps/mobile/eas.json" 2>/dev/null; then
  echo "❌ FAIL: Credentials in eas.json — move to EAS Secrets and rotate"
  FAIL=true
else
  echo "✅ eas.json clean"
fi
echo ""

# 5. Staged .env files
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
