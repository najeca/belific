#!/bin/bash
set -e
MOBILE="$(git rev-parse --show-toplevel)/mobile"
FAIL=false

echo "=== Belific iOS Pre-Build Check ==="
echo ""

# 1. node_modules present
echo "--- node_modules ---"
if [ ! -d "$MOBILE/node_modules" ]; then
  echo "❌ FAIL: node_modules missing — run: cd mobile && npm install --legacy-peer-deps"
  FAIL=true
else
  echo "✅ node_modules present"
fi
echo ""

# 2. expo-modules-autolinking present
echo "--- expo-modules-autolinking ---"
if [ ! -d "$MOBILE/node_modules/expo-modules-autolinking" ]; then
  echo "❌ FAIL: expo-modules-autolinking missing — run: npm install expo-modules-autolinking --legacy-peer-deps"
  FAIL=true
else
  echo "✅ expo-modules-autolinking present"
fi
echo ""

# 3. expo-font present
echo "--- expo-font ---"
if [ ! -d "$MOBILE/node_modules/expo-font" ]; then
  echo "❌ FAIL: expo-font missing — run: npm install expo-font --legacy-peer-deps"
  FAIL=true
else
  echo "✅ expo-font present"
fi
echo ""

# 4. babel.config.js exists
echo "--- babel.config.js ---"
if [ ! -f "$MOBILE/babel.config.js" ]; then
  echo "❌ FAIL: babel.config.js missing in mobile/ — Metro will crash on launch"
  FAIL=true
else
  echo "✅ babel.config.js present"
fi
echo ""

# 5. app.json has expo-font in plugins
echo "--- app.json expo-font plugin ---"
if ! grep -q '"expo-font"' "$MOBILE/app.json"; then
  echo "⚠️  WARNING: expo-font not in app.json plugins — autolinking may skip it"
else
  echo "✅ expo-font in app.json plugins"
fi
echo ""

echo "==========================="
if [ "$FAIL" = true ]; then
  echo "RESULT: ❌ PRE-BUILD CHECK FAILED — fix above before proceeding"
  exit 1
else
  echo "RESULT: ✅ PRE-BUILD CHECK PASSED"
fi
