#!/bin/bash
echo "=== Landis Pre-Test Check ==="

# Check Metro is running
if lsof -i :8081 | grep -q LISTEN; then
  echo "✅ Metro running on port 8081"
else
  echo "❌ Metro not running"
  echo "   Start with: npx expo start --dev-client --tunnel"
  exit 1
fi

# Check git is clean
if git diff --quiet && git diff --cached --quiet; then
  echo "✅ Working tree clean"
else
  echo "⚠️  Uncommitted changes present"
fi

echo ""
echo "Ready to test. Open Landis dev build on device."
