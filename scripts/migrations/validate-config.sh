#!/bin/bash
# Configuration Validation Script
# Validates Godel configuration files and environment variables

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_DIR="/Users/jasontang/clawd/projects/godel"
CONFIG_DIR="${PROJECT_DIR}/config"
ENV_FILE="${PROJECT_DIR}/.env"
ERRORS=0
WARNINGS=0

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_ok() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    ((ERRORS++))
}

# =============================================================================
# File Validation
# =============================================================================

validate_config_files() {
    log_info "Validating configuration files..."
    
    # Check config directory exists
    if [[ ! -d "$CONFIG_DIR" ]]; then
        log_error "Config directory not found: $CONFIG_DIR"
        return
    fi
    
    # Check for required config files
    local required_files=(
        "godel.example.yaml"
    )
    
    for file in "${required_files[@]}"; do
        if [[ -f "${CONFIG_DIR}/${file}" ]]; then
            log_ok "Found ${file}"
        else
            log_warn "Missing ${file}"
        fi
    done
    
    # Check for old dash config files
    local old_dash_files=$(find "$CONFIG_DIR" -name "dash.*" 2>/dev/null || true)
    if [[ -n "$old_dash_files" ]]; then
        log_warn "Found old dash config files:"
        echo "$old_dash_files" | while read -r file; do
            log_warn "  - $file"
        done
    else
        log_ok "No old dash config files found"
    fi
}

# =============================================================================
# Environment Variables Validation
# =============================================================================

validate_env_vars() {
    log_info "Validating environment variables..."
    
    # Check .env file exists
    if [[ -f "$ENV_FILE" ]]; then
        log_ok ".env file exists"
    else
        log_warn ".env file not found (copy from .env.example)"
    fi
    
    # Check .env.example exists and is complete
    if [[ -f "${PROJECT_DIR}/.env.example" ]]; then
        log_ok ".env.example template exists"
        
        # Count required variables in example
        local required_count=$(grep -c "^[A-Z]" "${PROJECT_DIR}/.env.example" || echo 0)
        log_info ".env.example contains ~${required_count} configuration variables"
    else
        log_error ".env.example not found"
    fi
    
    # Check for old dash_ environment variable references
    if [[ -f "$ENV_FILE" ]]; then
        local dash_refs=$(grep -i "^DASH_" "$ENV_FILE" || true)
        if [[ -n "$dash_refs" ]]; then
            log_warn "Found DASH_ prefixed environment variables in .env:"
            echo "$dash_refs" | head -5 | while read -r line; do
                log_warn "  $line"
            done
        else
            log_ok "No old DASH_ prefixed variables found"
        fi
    fi
}

# =============================================================================
# Database Path Validation
# =============================================================================

validate_database_paths() {
    log_info "Validating database paths..."
    
    # Check for old dash.db files
    if [[ -f "${PROJECT_DIR}/dash.db" ]]; then
        log_warn "Legacy dash.db found in project root (should be migrated to .godel/godel.db)"
    else
        log_ok "No legacy dash.db in project root"
    fi
    
    # Check for .godel directory and godel.db
    if [[ -d "${PROJECT_DIR}/.godel" ]]; then
        log_ok ".godel directory exists"
        
        if [[ -f "${PROJECT_DIR}/.godel/godel.db" ]]; then
            local db_size=$(du -h "${PROJECT_DIR}/.godel/godel.db" | cut -f1)
            log_ok "godel.db exists (${db_size})"
        else
            log_warn "godel.db not found in .godel directory"
        fi
    else
        log_warn ".godel directory not found"
    fi
    
    # Check GODEL_DB_PATH in .env
    if [[ -f "$ENV_FILE" ]]; then
        local db_path=$(grep "^GODEL_DB_PATH=" "$ENV_FILE" | cut -d= -f2 || true)
        if [[ -n "$db_path" ]]; then
            log_ok "GODEL_DB_PATH configured: $db_path"
        else
            log_warn "GODEL_DB_PATH not set in .env (defaults to ./godel.db)"
        fi
    fi
}

# =============================================================================
# YAML Config Validation
# =============================================================================

validate_yaml_configs() {
    log_info "Validating YAML configuration..."
    
    # Check if yq is available for YAML validation
    if command -v yq &> /dev/null; then
        log_ok "yq is available for YAML validation"
        
        for config_file in "$CONFIG_DIR"/godel.*.yaml; do
            if [[ -f "$config_file" ]]; then
                if yq eval '.' "$config_file" > /dev/null 2>&1; then
                    log_ok "Valid YAML: $(basename "$config_file")"
                else
                    log_error "Invalid YAML: $(basename "$config_file")"
                fi
            fi
        done
    else
        log_warn "yq not installed, skipping YAML syntax validation"
        log_info "Install with: brew install yq"
    fi
    
    # Check for dash references in config files
    local dash_refs=$(grep -r "dash" "$CONFIG_DIR" --include="*.yaml" -i || true)
    if [[ -n "$dash_refs" ]]; then
        log_warn "Found 'dash' references in config files:"
        echo "$dash_refs" | head -5 | while read -r line; do
            log_warn "  $line"
        done
    else
        log_ok "No 'dash' references in config files"
    fi
}

# =============================================================================
# Secrets Validation
# =============================================================================

validate_secrets() {
    log_info "Validating secrets configuration..."
    
    if [[ -f "$ENV_FILE" ]]; then
        # Check for placeholder secrets
        local placeholders=$(grep -E "(your_|change-me|example|placeholder)" "$ENV_FILE" -i || true)
        if [[ -n "$placeholders" ]]; then
            log_warn "Found placeholder values in .env:"
            echo "$placeholders" | grep -E "^[A-Z]" | head -5 | while read -r line; do
                log_warn "  $line"
            done
        else
            log_ok "No obvious placeholder values found"
        fi
        
        # Check for session secret
        if grep -q "SESSION_SECRET=" "$ENV_FILE"; then
            local session_secret=$(grep "^SESSION_SECRET=" "$ENV_FILE" | cut -d= -f2)
            local secret_len=${#session_secret}
            if [[ $secret_len -ge 32 ]]; then
                log_ok "SESSION_SECRET is set and has good length ($secret_len chars)"
            else
                log_warn "SESSION_SECRET is too short ($secret_len chars, recommend 32+)"
            fi
        else
            log_warn "SESSION_SECRET not set"
        fi
    fi
}

# =============================================================================
# Summary
# =============================================================================

print_summary() {
    echo ""
    echo "=========================================="
    echo "Configuration Validation Summary"
    echo "=========================================="
    
    if [[ $ERRORS -eq 0 && $WARNINGS -eq 0 ]]; then
        echo -e "${GREEN}✓ All checks passed!${NC}"
    elif [[ $ERRORS -eq 0 ]]; then
        echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
        echo "Review warnings above and address as needed."
    else
        echo -e "${RED}✗ $ERRORS error(s) and $WARNINGS warning(s) found${NC}"
        echo "Please fix errors before proceeding."
    fi
    
    echo ""
    echo "Configuration files:"
    echo "  - Config dir: $CONFIG_DIR"
    echo "  - Environment: $ENV_FILE"
    echo "  - Template: ${PROJECT_DIR}/.env.example"
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo "=========================================="
    echo "Godel Configuration Validator"
    echo "=========================================="
    echo ""
    
    cd "$PROJECT_DIR"
    
    validate_config_files
    echo ""
    validate_env_vars
    echo ""
    validate_database_paths
    echo ""
    validate_yaml_configs
    echo ""
    validate_secrets
    
    print_summary
    
    exit $ERRORS
}

main "$@"
