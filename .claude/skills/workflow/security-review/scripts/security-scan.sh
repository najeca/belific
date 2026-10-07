#!/bin/bash
# SCAN_ROOT lets the tests (mobile/lib/securityScan.test.ts) run this against a
# throwaway git repository. Normally it is the repository this script is in.
ROOT="${SCAN_ROOT:-$(git rev-parse --show-toplevel)}"
MOBILE="$ROOT/mobile"
SELF=".claude/skills/workflow/security-review/scripts/security-scan.sh"
FAIL=false

cd "$ROOT" || exit 2

echo "=== Belific Security Scan ==="
echo ""

# 1. Hardcoded credentials: three checks, all on tracked files.
echo "--- Hardcoded credentials ---"

# 1a. A real secret VALUE in any tracked file of any kind (docs, markdown and
# env files included). Only this script is exempt, because it holds the patterns.
VALUES=$(git grep -n -E "eyJhbGci|sk-ant-|sb_secret_|password\s*=\s*['\"][^'\"]{8}" \
  -- . ":(exclude)$SELF" 2>/dev/null || true)

# 1b. The NAME of the service role variable anywhere outside supabase/functions.
# Documentation may mention the name; code may not.
NAME_RE="SUPABASE_SERVICE_ROLE"
OUTSIDE=$(git grep -n "$NAME_RE" \
  -- . ":(exclude)$SELF" ":(exclude)docs/" ":(exclude)*.md" 2>/dev/null \
  | grep -v -E "^(mobile/)?supabase/functions/" || true)

# 1c. Inside supabase/functions the name is allowed on exactly two kinds of
# line: a comment line, and reading it from the function's environment as
#   const x = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');   (either quote style)
# Any other line there (a literal value, a fallback, a log of it) fails.
ALLOWED_ENV_RE="^[[:space:]]*(const|let)[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=[[:space:]]*Deno\.env\.get\(('SUPABASE_SERVICE_ROLE_KEY'|\"SUPABASE_SERVICE_ROLE_KEY\")\);?[[:space:]]*$"
ALLOWED_COMMENT_RE="^[[:space:]]*(//|\*|/\*|#)"
INSIDE=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  content="${line#*:*:}"
  if [[ "$content" =~ $ALLOWED_ENV_RE ]] || [[ "$content" =~ $ALLOWED_COMMENT_RE ]]; then
    continue
  fi
  INSIDE="${INSIDE}${line}"$'\n'
done < <(git grep -n "$NAME_RE" -- "supabase/functions" "mobile/supabase/functions" 2>/dev/null || true)

MATCHES=$(printf '%s\n%s\n%s\n' "$VALUES" "$OUTSIDE" "$INSIDE" | sed '/^$/d')
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
