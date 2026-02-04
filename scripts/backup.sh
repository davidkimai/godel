#!/bin/bash
# Backup script for Dash project

PROJECT_DIR="/Users/jasontang/clawd/projects/dash"
BACKUP_DIR="/tmp/dash-backups"
TIMESTAMP=$(date +%Y%m%d-%H%M)

cd "$PROJECT_DIR"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create tar backup
tar -czf "$BACKUP_DIR/dash-backup-$TIMESTAMP.tar.gz" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='*.db' \
  .

# Keep only last 10 backups
ls -t "$BACKUP_DIR"/dash-backup-*.tar.gz | tail -n +11 | xargs -r rm

echo "✅ Backup created: $BACKUP_DIR/dash-backup-$TIMESTAMP.tar.gz"
