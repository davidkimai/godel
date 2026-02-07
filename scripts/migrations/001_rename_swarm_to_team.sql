-- Migration 001: Rename swarm_* tables to team_*
-- Date: 2026-02-06
-- Description: Renames all swarm-related database objects to team terminology

-- =============================================================================
-- TABLE RENAMES
-- =============================================================================

-- Rename swarms table to teams (if it exists)
ALTER TABLE IF EXISTS swarms RENAME TO teams;

-- =============================================================================
-- COLUMN RENAMES
-- =============================================================================

-- Rename swarm_id columns to team_id in all tables
ALTER TABLE IF EXISTS agents RENAME COLUMN swarm_id TO team_id;
ALTER TABLE IF EXISTS events RENAME COLUMN swarm_id TO team_id;

-- =============================================================================
-- INDEX RENAMES
-- =============================================================================

-- Drop old indexes (SQLite doesn't support RENAME INDEX directly)
DROP INDEX IF EXISTS idx_agents_swarm;
DROP INDEX IF EXISTS idx_events_swarm;

-- Create new indexes with team naming
CREATE INDEX IF NOT EXISTS idx_agents_team ON agents(team_id);
CREATE INDEX IF NOT EXISTS idx_events_team ON events(team_id);

-- =============================================================================
-- VERIFY MIGRATION
-- =============================================================================

-- Check tables exist with correct names
SELECT name FROM sqlite_master WHERE type='table' AND name IN ('teams', 'agents', 'events');

-- Check indexes exist with correct names
SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%_team';
