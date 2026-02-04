-- Migration: 002_add_indexes
-- Created: 2026-02-03

-- Up
-- Add performance indexes for common query patterns

-- Events table indexes for time-series queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_timestamp_type 
    ON events(timestamp DESC, type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_severity 
    ON events(severity) WHERE severity IN ('error', 'critical');

-- Agents table indexes for status queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_status_spawned 
    ON agents(status, spawned_at DESC);

-- Budget monitoring indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_budgets_consumption 
    ON budgets(swarm_id, consumed DESC) WHERE consumed > 0;

-- Session cleanup index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_expired 
    ON sessions(expires_at) WHERE expires_at < NOW();

-- Down
-- Remove added indexes
DROP INDEX IF EXISTS idx_events_timestamp_type;
DROP INDEX IF EXISTS idx_events_severity;
DROP INDEX IF EXISTS idx_agents_status_spawned;
DROP INDEX IF EXISTS idx_budgets_consumption;
DROP INDEX IF EXISTS idx_sessions_expired;
