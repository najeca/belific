#!/bin/bash
ROOT="$(git rev-parse --show-toplevel)"
MOBILE="$ROOT/apps/mobile"
PASS=true

echo "=== Checking Known iOS Issues ==="

# 1. Polyfill order
FIRST_LINE=$(head -n 1 "$MOBILE/index.js")
if [[ "$FIRST_LINE" != *"react-native-get-random-values"* ]]; then
  echo "❌ index.js line 1 is not react-native-get-random-values"
  PASS=false
else
  echo "✅ Polyfill order correct"
fi

# 2. Lazy Supabase
if grep -q "createClient()" "$MOBILE/lib/supabase.ts" 2>/dev/null && \
   ! grep -q "getSupabase" "$MOBILE/lib/supabase.ts" 2>/dev/null; then
  echo "❌ createClient() at module scope in supabase.ts"
  PASS=false
else
  echo "✅ Supabase client is lazy"
fi

# 3. babel.config.js
if [ ! -f "$MOBILE/babel.config.js" ]; then
  echo "❌ babel.config.js missing"
  PASS=false
else
  echo "✅ babel.config.js exists"
fi

# 4. Metro hierarchical lookup
if grep -q "disableHierarchicalLookup: true" "$MOBILE/metro.config.js" 2>/dev/null; then
  echo "❌ disableHierarchicalLookup is true — must be false"
  PASS=false
else
  echo "✅ disableHierarchicalLookup is false"
fi

# 5. Credentials in eas.json
if grep -qE "SUPABASE|ANTHROPIC|API_KEY" "$MOBILE/eas.json" 2>/dev/null; then
  echo "⚠️  WARNING: Credentials found in eas.json — rotate and move to EAS Secrets"
  PASS=false
else
  echo "✅ eas.json clean"
fi

echo ""
if [ "$PASS" = true ]; then
  echo "All checks passed."
else
  echo "One or more checks failed — fix before building."
fi
