-- Migration: 002_add_indexes
-- Created: 2026-02-03

-- Up
-- Add performance indexes for common query patterns
-- Note: Using regular CREATE INDEX instead of CONCURRENTLY for transaction compatibility

-- Events table indexes for time-series queries
CREATE INDEX IF NOT EXISTS idx_events_timestamp_type 
    ON events(timestamp DESC, type);

CREATE INDEX IF NOT EXISTS idx_events_severity 
    ON events(severity) WHERE severity IN ('error', 'critical');

-- Agents table indexes for status queries
CREATE INDEX IF NOT EXISTS idx_agents_status_spawned 
    ON agents(status, spawned_at DESC);

-- Budget monitoring indexes
CREATE INDEX IF NOT EXISTS idx_budgets_consumption 
    ON budgets(team_id, consumed DESC) WHERE consumed > 0;

-- Session expiration index (no NOW() in predicate - not immutable)
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at 
    ON sessions(expires_at) WHERE expires_at IS NOT NULL;

-- Down
-- Remove added indexes
DROP INDEX IF EXISTS idx_events_timestamp_type;
DROP INDEX IF EXISTS idx_events_severity;
DROP INDEX IF EXISTS idx_agents_status_spawned;
DROP INDEX IF EXISTS idx_budgets_consumption;
DROP INDEX IF EXISTS idx_sessions_expires_at;
