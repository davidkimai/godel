-- Migration: Add Version Columns for Optimistic Locking
-- This migration adds version tracking to support optimistic locking
-- and prevents race conditions during concurrent updates

-- Add version column to agents table
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;

-- Add version column to teams table
ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;

-- Add agent count columns to teams for efficient counting
ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS total_agents INTEGER DEFAULT 0;

ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS running_agents INTEGER DEFAULT 0;

ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS completed_agents INTEGER DEFAULT 0;

ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS failed_agents INTEGER DEFAULT 0;

-- Initialize version values for existing records
UPDATE agents SET version = 0 WHERE version IS NULL;
UPDATE teams SET version = 0 WHERE version IS NULL;

-- Add updated_at columns if they don't exist
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create index for efficient version lookups
CREATE INDEX IF NOT EXISTS idx_agents_version ON agents(id, version);
CREATE INDEX IF NOT EXISTS idx_swarms_version ON teams(id, version);

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for auto-updating updated_at
DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_swarms_updated_at ON teams;
CREATE TRIGGER update_swarms_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment documenting the optimistic locking pattern
COMMENT ON COLUMN agents.version IS 'Optimistic locking version - incremented on every update';
COMMENT ON COLUMN teams.version IS 'Optimistic locking version - incremented on every update';
