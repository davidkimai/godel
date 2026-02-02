#!/bin/bash
#
# Migration Script: console.* to Structured Logger
# 
# This script tracks replacements of console.* calls with structured logger calls.
# Run this after migrating files to record the changes.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$(dirname "${SCRIPT_DIR}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/migration-log.txt"

# ANSI colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[LOG]${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

# Initialize migration log
init_log() {
    echo "========================================" > "$LOG_FILE"
    echo "Logger Migration Log" >> "$LOG_FILE"
    echo "Started: $(date -Iseconds)" >> "$LOG_FILE"
    echo "========================================" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
}

# Count console.* calls before migration
count_console_calls() {
    local count
    count=$(grep -r "console\." "${PROJECT_DIR}/src" --include="*.ts" 2>/dev/null | wc -l)
    echo "$count"
}

# Get list of files with console.* calls
get_console_files() {
    grep -r "console\." "${PROJECT_DIR}/src" --include="*.ts" -l 2>/dev/null
}

# Record a migration
record_migration() {
    local file="$1"
    local pattern="$2"
    local replacement="$3"
    
    echo "File: $file" >> "$LOG_FILE"
    echo "  Pattern: $pattern" >> "$LOG_FILE"
    echo "  Replacement: $replacement" >> "$LOG_FILE"
    echo "  Migrated: $(date -Iseconds)" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
}

# Show migration report
show_report() {
    local before="$1"
    local after="$2"
    local files="$3"
    
    echo ""
    echo "========================================"
    echo "          Migration Report"
    echo "========================================"
    echo ""
    echo "Console.* calls before: $before"
    echo "Console.* calls after:  $after"
    echo "Files with console.*:   $files"
    echo ""
    echo "Migration log: $LOG_FILE"
    echo ""
    
    if [ "$after" -lt "$before" ]; then
        local reduced=$((before - after))
        local percent=$((reduced * 100 / before))
        echo -e "${GREEN}Progress: ${reduced} calls replaced (${percent}% reduction)${NC}"
    fi
}

# Main menu
main() {
    init_log
    
    echo ""
    echo "========================================"
    echo "   Structured Logger Migration Script  "
    echo "========================================"
    echo ""
    
    while true; do
        echo "Options:"
        echo "  1) Count console.* calls"
        echo "  2) List files with console.*"
        echo "  3) Record a migration"
        echo "  4) Show migration report"
        echo "  5) Run full analysis"
        echo "  6) Exit"
        echo ""
        read -p "Select an option: " choice
        echo ""
        
        case "$choice" in
            1)
                local count
                count=$(count_console_calls)
                info "Console.* calls found: $count"
                ;;
            2)
                info "Files with console.* calls:"
                get_console_files
                ;;
            3)
                read -p "Enter file path: " file
                read -p "Enter original pattern: " pattern
                read -p "Enter replacement: " replacement
                record_migration "$file" "$pattern" "$replacement"
                log "Recorded migration for: $file"
                ;;
            4)
                local before=$(grep -c "console\." "${PROJECT_DIR}/src" --include="*.ts" -r 2>/dev/null || echo 0)
                local after=$(count_console_calls)
                local files=$(get_console_files | wc -l)
                show_report "$before" "$after" "$files"
                ;;
            5)
                local before=$(grep -c "console\." "${PROJECT_DIR}/src" --include="*.ts" -r 2>/dev/null || echo 0)
                local after=$(count_console_calls)
                local files=$(get_console_files | wc -l)
                
                info "Before: $before console.* calls"
                info "After: $after console.* calls"
                info "Files remaining: $files"
                
                echo ""
                info "Files still containing console.*:"
                get_console_files
                
                show_report "$before" "$after" "$files"
                ;;
            6)
                log "Migration script exiting"
                exit 0
                ;;
            *)
                error "Invalid option"
                ;;
        esac
        echo ""
    done
}

# Run main if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
