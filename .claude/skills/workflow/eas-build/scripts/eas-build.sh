#!/bin/bash
set -e
PROFILE=${1:-preview}

if [[ "$PROFILE" != "preview" && "$PROFILE" != "production" ]]; then
  echo "Usage: eas-build.sh <preview|production>"
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT/apps/mobile"

echo "=== EAS Build: $PROFILE (local) ==="
EXPO_USE_STICKY_RESOLVER=1 eas build --platform ios --profile "$PROFILE" --local
