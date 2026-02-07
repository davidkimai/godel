#!/bin/bash
# Database Migration Script: dash.db → .godel/godel.db
# Date: 2026-02-06
# Description: Migrates data from legacy dash.db to .godel/godel.db with swarm→team renaming

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Paths
PROJECT_DIR="/Users/jasontang/clawd/projects/godel"
SOURCE_DB="${PROJECT_DIR}/dash.db"
TARGET_DB="${PROJECT_DIR}/.godel/godel.db"
BACKUP_DIR="${PROJECT_DIR}/.godel/backups"
MIGRATION_LOG="${PROJECT_DIR}/.godel/migration-$(date +%Y%m%d-%H%M%S).log"

# =============================================================================
# Helper Functions
# =============================================================================

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] INFO:${NC} $1" | tee -a "$MIGRATION_LOG"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARN:${NC} $1" | tee -a "$MIGRATION_LOG"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$MIGRATION_LOG"
    exit 1
}

# =============================================================================
# Pre-flight Checks
# =============================================================================

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if source database exists
    if [[ ! -f "$SOURCE_DB" ]]; then
        warn "Source database not found: $SOURCE_DB"
        log "Nothing to migrate. Exiting."
        exit 0
    fi
    
    # Check if sqlite3 is available
    if ! command -v sqlite3 &> /dev/null; then
        error "sqlite3 is not installed. Please install it first."
    fi
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    log "Prerequisites check passed"
}

# =============================================================================
# Backup
# =============================================================================

create_backup() {
    log "Creating backup of source database..."
    
    local backup_file="${BACKUP_DIR}/dash-$(date +%Y%m%d-%H%M%S).db"
    cp "$SOURCE_DB" "$backup_file"
    log "Backup created: $backup_file"
    
    # Also backup target if it exists
    if [[ -f "$TARGET_DB" ]]; then
        local target_backup="${BACKUP_DIR}/godel-pre-migration-$(date +%Y%m%d-%H%M%S).db"
        cp "$TARGET_DB" "$target_backup"
        log "Target backup created: $target_backup"
    fi
}

# =============================================================================
# Schema Migration
# =============================================================================

ensure_target_schema() {
    log "Ensuring target database schema..."
    
    sqlite3 "$TARGET_DB" << 'EOF'
-- Teams table (renamed from swarms)
CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    config TEXT NOT NULL,
    agents TEXT NOT NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    budget_allocated REAL,
    budget_consumed REAL,
    budget_remaining REAL,
    metrics TEXT
);

-- Agents table with team_id (renamed from swarm_id)
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    label TEXT,
    status TEXT NOT NULL,
    model TEXT NOT NULL,
    task TEXT NOT NULL,
    spawned_at TEXT NOT NULL,
    completed_at TEXT,
    runtime INTEGER DEFAULT 0,
    pause_time TEXT,
    paused_by TEXT,
    team_id TEXT,
    parent_id TEXT,
    child_ids TEXT,
    context TEXT,
    code TEXT,
    reasoning TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_error TEXT,
    budget_limit REAL,
    safety_boundaries TEXT,
    metadata TEXT
);

-- Events table with team_id (renamed from swarm_id)
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,
    source TEXT,
    payload TEXT,
    agent_id TEXT,
    team_id TEXT
);
EOF

    # Create indexes separately
    sqlite3 "$TARGET_DB" << 'EOF'
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_team ON agents(team_id);
CREATE INDEX IF NOT EXISTS idx_agents_status_id ON agents(status, id);
CREATE INDEX IF NOT EXISTS idx_agents_spawned ON agents(spawned_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_team ON events(team_id);
EOF

    log "Target schema created/verified"
}

# =============================================================================
# Data Migration
# =============================================================================

migrate_data() {
    log "Starting data migration..."
    
    # Get counts from source
    local team_count=$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM swarms;" 2>/dev/null || echo 0)
    local agent_count=$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM agents;" 2>/dev/null || echo 0)
    local event_count=$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM events;" 2>/dev/null || echo 0)
    
    log "Source database contains:"
    log "  - Teams (swarms): $team_count"
    log "  - Agents: $agent_count"
    log "  - Events: $event_count"
    
    # Migrate teams (from swarms table)
    if [[ "$team_count" -gt 0 ]]; then
        log "Migrating teams..."
        sqlite3 "$SOURCE_DB" << EOF > /tmp/teams.sql
.dump swarms
EOF
        # Modify the dump to insert into teams table
        sed 's/INSERT INTO "swarms"/INSERT OR REPLACE INTO "teams"/g' /tmp/teams.sql | sqlite3 "$TARGET_DB"
        log "Teams migrated successfully"
    fi
    
    # Migrate agents (swarm_id → team_id)
    if [[ "$agent_count" -gt 0 ]]; then
        log "Migrating agents..."
        sqlite3 "$TARGET_DB" << EOF
ATTACH DATABASE '$SOURCE_DB' AS source;
INSERT OR REPLACE INTO agents (
    id, label, status, model, task, spawned_at, completed_at, runtime,
    pause_time, paused_by, team_id, parent_id, child_ids, context, code,
    reasoning, retry_count, max_retries, last_error, budget_limit,
    safety_boundaries, metadata
)
SELECT 
    id, label, status, model, task, spawned_at, completed_at, runtime,
    pause_time, paused_by, swarm_id, parent_id, child_ids, context, code,
    reasoning, retry_count, max_retries, last_error, budget_limit,
    safety_boundaries, metadata
FROM source.agents;
DETACH DATABASE source;
EOF
        log "Agents migrated successfully"
    fi
    
    # Migrate events (swarm_id → team_id)
    if [[ "$event_count" -gt 0 ]]; then
        log "Migrating events..."
        sqlite3 "$TARGET_DB" << EOF
ATTACH DATABASE '$SOURCE_DB' AS source;
INSERT OR REPLACE INTO events (
    id, timestamp, event_type, source, payload, agent_id, team_id
)
SELECT 
    id, timestamp, event_type, source, payload, agent_id, swarm_id
FROM source.events;
DETACH DATABASE source;
EOF
        log "Events migrated successfully"
    fi
}

# =============================================================================
# Verification
# =============================================================================

verify_migration() {
    log "Verifying migration..."
    
    local team_count=$(sqlite3 "$TARGET_DB" "SELECT COUNT(*) FROM teams;")
    local agent_count=$(sqlite3 "$TARGET_DB" "SELECT COUNT(*) FROM agents;")
    local event_count=$(sqlite3 "$TARGET_DB" "SELECT COUNT(*) FROM events;")
    
    log "Target database now contains:"
    log "  - Teams: $team_count"
    log "  - Agents: $agent_count"
    log "  - Events: $event_count"
    
    # Verify schema
    local tables=$(sqlite3 "$TARGET_DB" ".tables")
    log "Tables in target: $tables"
    
    # Check for any remaining swarm references
    local swarm_cols=$(sqlite3 "$TARGET_DB" "SELECT name FROM pragma_table_info('agents') WHERE name LIKE '%swarm%';" || true)
    if [[ -n "$swarm_cols" ]]; then
        warn "Found swarm columns: $swarm_cols"
    else
        log "✓ No swarm columns found in agents table"
    fi
    
    # Check team_id column exists
    local team_col=$(sqlite3 "$TARGET_DB" "SELECT name FROM pragma_table_info('agents') WHERE name = 'team_id';")
    if [[ -n "$team_col" ]]; then
        log "✓ team_id column exists in agents table"
    else
        error "team_id column not found in agents table!"
    fi
    
    log "Migration verification complete"
}

# =============================================================================
# Cleanup
# =============================================================================

cleanup_source() {
    log "Cleaning up source database files..."
    
    # Move dash.db files to backup
    local backup_timestamp=$(date +%Y%m%d-%H%M%S)
    
    if [[ -f "${PROJECT_DIR}/dash.db" ]]; then
        mv "${PROJECT_DIR}/dash.db" "${BACKUP_DIR}/dash-${backup_timestamp}.db"
        log "Moved dash.db to backup"
    fi
    
    if [[ -f "${PROJECT_DIR}/dash.db-shm" ]]; then
        mv "${PROJECT_DIR}/dash.db-shm" "${BACKUP_DIR}/dash-${backup_timestamp}.db-shm"
        log "Moved dash.db-shm to backup"
    fi
    
    if [[ -f "${PROJECT_DIR}/dash.db-wal" ]]; then
        mv "${PROJECT_DIR}/dash.db-wal" "${BACKUP_DIR}/dash-${backup_timestamp}.db-wal"
        log "Moved dash.db-wal to backup"
    fi
    
    log "Source files backed up to: $BACKUP_DIR"
}

# =============================================================================
# Rollback
# =============================================================================

rollback() {
    error "Rollback requested. Restoring from backup..."
    # Implementation would restore from the backup created earlier
    log "Rollback complete"
}

# =============================================================================
# Main
# =============================================================================

main() {
    log "=========================================="
    log "Database Migration: dash.db → .godel/godel.db"
    log "=========================================="
    
    cd "$PROJECT_DIR"
    
    # Parse arguments
    local do_cleanup=false
    local dry_run=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --cleanup)
                do_cleanup=true
                shift
                ;;
            --dry-run)
                dry_run=true
                shift
                ;;
            --rollback)
                rollback
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                ;;
        esac
    done
    
    if [[ "$dry_run" == true ]]; then
        log "DRY RUN MODE - No changes will be made"
        check_prerequisites
        log "Would migrate from: $SOURCE_DB"
        log "Would migrate to: $TARGET_DB"
        local team_count=$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM swarms;" 2>/dev/null || echo 0)
        local agent_count=$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM agents;" 2>/dev/null || echo 0)
        log "Would migrate $team_count teams and $agent_count agents"
        exit 0
    fi
    
    # Run migration steps
    check_prerequisites
    create_backup
    ensure_target_schema
    migrate_data
    verify_migration
    
    if [[ "$do_cleanup" == true ]]; then
        cleanup_source
    else
        log ""
        log "Source files preserved. To clean up after verification, run:"
        log "  $0 --cleanup"
    fi
    
    log ""
    log "=========================================="
    log "Migration Complete!"
    log "=========================================="
    log "Target database: $TARGET_DB"
    log "Backup location: $BACKUP_DIR"
    log "Log file: $MIGRATION_LOG"
}

# Run main function
trap 'error "Migration failed. Check log: $MIGRATION_LOG"' ERR
main "$@"
