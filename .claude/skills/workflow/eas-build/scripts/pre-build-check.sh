#!/bin/bash
set -e
ROOT="$(git rev-parse --show-toplevel)"
MOBILE="$ROOT/apps/mobile"
FAIL=false

echo "=== Pre-Build Quality Gates ==="

# 1. No credentials in eas.json
if grep -qE "SUPABASE|ANTHROPIC|API_KEY" "$MOBILE/eas.json" 2>/dev/null; then
  echo "❌ Credentials found in eas.json — move to EAS Secrets"
  FAIL=true
else
  echo "✅ eas.json clean"
fi

# 2. No sensitive console.log
LOGS=$(grep -rn "console\.log" --include="*.ts" --include="*.tsx" --include="*.js" \
  --exclude-dir=node_modules "$MOBILE" \
  | grep -iE "key|token|secret|password|supabase|url" || true)
if [ -n "$LOGS" ]; then
  echo "❌ Sensitive console.log found:"
  echo "$LOGS"
  FAIL=true
else
  echo "✅ No sensitive console.log"
fi

# 3. Zero TypeScript 'as any'
ANY=$(grep -rn " as any" --include="*.ts" --include="*.tsx" "$MOBILE/app" "$MOBILE/lib" 2>/dev/null || true)
if [ -n "$ANY" ]; then
  echo "❌ 'as any' found:"
  echo "$ANY"
  FAIL=true
else
  echo "✅ Zero 'as any'"
fi

# 4. Git working tree clean
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "❌ Uncommitted changes — commit before building"
  FAIL=true
else
  echo "✅ Working tree clean"
fi

echo ""
if [ "$FAIL" = true ]; then
  echo "RESULT: ❌ FAILED — fix all issues before building"
  exit 1
else
  echo "RESULT: ✅ All gates passed. Safe to build."
fi
