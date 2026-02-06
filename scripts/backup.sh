#!/bin/bash
# Backup script for Godel project

PROJECT_DIR="/Users/jasontang/clawd/projects/godel"
BACKUP_DIR="/tmp/godel-backups"
TIMESTAMP=$(date +%Y%m%d-%H%M)

cd "$PROJECT_DIR"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create tar backup
tar -czf "$BACKUP_DIR/godel-backup-$TIMESTAMP.tar.gz" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='*.db' \
  .

# Keep only last 10 backups
ls -t "$BACKUP_DIR"/godel-backup-*.tar.gz | tail -n +11 | xargs -r rm

echo "✅ Backup created: $BACKUP_DIR/godel-backup-$TIMESTAMP.tar.gz"
