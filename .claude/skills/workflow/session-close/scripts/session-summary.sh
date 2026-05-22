#!/bin/bash
echo "=== Session Summary ==="
echo ""
echo "--- Working tree ---"
git status --short
echo ""
echo "--- Uncommitted diff ---"
git diff --stat
echo ""
echo "--- Commits since last push ---"
git log origin/$(git rev-parse --abbrev-ref HEAD)..HEAD --oneline 2>/dev/null \
  || git log --oneline -10
