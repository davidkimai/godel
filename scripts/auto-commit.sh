#!/bin/bash
# Auto-commit script for Godel project
# Commits all changes with timestamp

PROJECT_DIR="/Users/jasontang/clawd/projects/godel"
COMMIT_MSG="${1:-auto: $(date +%Y-%m-%d %H:%M)}"

cd "$PROJECT_DIR"

# Check if there are changes
if git status --porcelain | grep -q .; then
  echo "Changes detected, committing..."
  
  # Add all changes
  git add -A
  
  # Commit with message
  git commit -m "$COMMIT_MSG" --author="Godel Automation <auto@godel.local>"
  
  # Push to origin
  git push origin main
  
  echo "✅ Committed and pushed: $COMMIT_MSG"
else
  echo "ℹ️ No changes to commit"
fi
