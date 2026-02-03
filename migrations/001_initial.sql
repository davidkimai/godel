-- Initial PostgreSQL Schema for Dash
-- Migration: 001_initial
-- Created: 2026-02-03

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Swarms Table
-- Stores swarm configurations and metadata
-- ============================================
CREATE TABLE IF NOT EXISTS swarms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT swarms_status_check CHECK (status IN (
        'creating', 'active', 'scaling', 'paused', 'completed', 'failed', 'destroyed'
    ))
);

-- Swarm indexes
CREATE INDEX idx_swarms_status ON swarms(status);
CREATE INDEX idx_swarms_created_at ON swarms(created_at DESC);

-- ============================================
-- Agents Table
-- Stores agent state and configuration
-- ============================================
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    swarm_id UUID REFERENCES swarms(id) ON DELETE SET NULL,
    label VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    lifecycle_state VARCHAR(50) NOT NULL DEFAULT 'initializing',
    model VARCHAR(100) NOT NULL,
    task TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    context JSONB,
    code JSONB,
    reasoning JSONB,
    safety_boundaries JSONB,
    spawned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    pause_time TIMESTAMP WITH TIME ZONE,
    paused_by VARCHAR(255),
    runtime INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_error TEXT,
    budget_limit DECIMAL(12, 4),
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT agents_status_check CHECK (status IN (
        'pending', 'running', 'paused', 'completed', 'failed', 'blocked', 'killed'
    )),
    CONSTRAINT agents_lifecycle_check CHECK (lifecycle_state IN (
        'initializing', 'spawning', 'running', 'pausing', 'paused', 
        'resuming', 'completing', 'failed', 'cleaning_up', 'destroyed'
    ))
);

-- Agent indexes
CREATE INDEX idx_agents_swarm_id ON agents(swarm_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_lifecycle ON agents(lifecycle_state);
CREATE INDEX idx_agents_spawned_at ON agents(spawned_at DESC);
CREATE INDEX idx_agents_model ON agents(model);

-- Composite index for common query patterns
CREATE INDEX idx_agents_swarm_status ON agents(swarm_id, status);

-- ============================================
-- Events Table
-- Event log for all system events
-- ============================================
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    swarm_id UUID REFERENCES swarms(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    correlation_id UUID,
    parent_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    entity_type VARCHAR(50) NOT NULL DEFAULT 'system',
    severity VARCHAR(20) DEFAULT 'info',
    
    -- Constraints
    CONSTRAINT events_entity_type_check CHECK (entity_type IN ('agent', 'task', 'system')),
    CONSTRAINT events_severity_check CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical'))
);

-- Event indexes - optimized for time-series queries
CREATE INDEX idx_events_swarm_id ON events(swarm_id);
CREATE INDEX idx_events_agent_id ON events(agent_id);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX idx_events_correlation ON events(correlation_id);

-- Composite indexes for common query patterns
CREATE INDEX idx_events_agent_time ON events(agent_id, timestamp DESC);
CREATE INDEX idx_events_swarm_time ON events(swarm_id, timestamp DESC);

-- Partitioning support (for future scaling)
-- Events table can be partitioned by timestamp for high-volume scenarios

-- ============================================
-- Sessions Table
-- Stores session tree data and state
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tree_data JSONB NOT NULL DEFAULT '{}',
    current_branch VARCHAR(255),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Session indexes
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- ============================================
-- Budgets Table
-- Tracks budget allocation and consumption per swarm
-- ============================================
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    swarm_id UUID NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
    scope_type VARCHAR(50) NOT NULL DEFAULT 'swarm',
    scope_id UUID NOT NULL,
    allocated DECIMAL(12, 4) NOT NULL DEFAULT 0,
    consumed DECIMAL(12, 4) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    max_tokens INTEGER,
    used_tokens INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT budgets_scope_check CHECK (scope_type IN ('swarm', 'agent', 'project')),
    CONSTRAINT budgets_currency_check CHECK (currency IN ('USD', 'EUR', 'GBP', 'CAD')),
    CONSTRAINT budgets_positive CHECK (allocated >= 0 AND consumed >= 0),
    CONSTRAINT budgets_unique_scope UNIQUE (scope_type, scope_id)
);

-- Budget indexes
CREATE INDEX idx_budgets_swarm_id ON budgets(swarm_id);
CREATE INDEX idx_budgets_scope ON budgets(scope_type, scope_id);

-- ============================================
-- Migration Tracking Table
-- Internal tracking for migrations
-- ============================================
CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    checksum VARCHAR(64) NOT NULL
);

-- ============================================
-- Functions and Triggers
-- ============================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_swarms_updated_at 
    BEFORE UPDATE ON swarms 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at 
    BEFORE UPDATE ON agents 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at 
    BEFORE UPDATE ON sessions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budgets_updated_at 
    BEFORE UPDATE ON budgets 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Views
-- ============================================

-- Swarm summary view with agent counts
CREATE OR REPLACE VIEW swarm_summary AS
SELECT 
    s.id,
    s.name,
    s.status,
    s.created_at,
    s.config,
    COUNT(a.id) FILTER (WHERE a.status = 'running') as running_agents,
    COUNT(a.id) as total_agents,
    b.allocated as budget_allocated,
    b.consumed as budget_consumed,
    CASE 
        WHEN b.allocated > 0 THEN ROUND((b.consumed / b.allocated) * 100, 2)
        ELSE 0 
    END as budget_percentage
FROM swarms s
LEFT JOIN agents a ON s.id = a.swarm_id
LEFT JOIN budgets b ON s.id = b.swarm_id AND b.scope_type = 'swarm'
GROUP BY s.id, s.name, s.status, s.created_at, s.config, b.allocated, b.consumed;

-- Agent activity view
CREATE OR REPLACE VIEW agent_activity AS
SELECT 
    a.id,
    a.label,
    a.status,
    a.lifecycle_state,
    a.model,
    a.task,
    a.swarm_id,
    s.name as swarm_name,
    a.spawned_at,
    a.completed_at,
    EXTRACT(EPOCH FROM (COALESCE(a.completed_at, NOW()) - a.spawned_at)) as duration_seconds,
    a.retry_count,
    a.runtime
FROM agents a
LEFT JOIN swarms s ON a.swarm_id = s.id;

-- Event statistics view (last 24 hours)
CREATE OR REPLACE VIEW event_stats_24h AS
SELECT 
    type,
    COUNT(*) as event_count,
    COUNT(DISTINCT agent_id) as unique_agents,
    COUNT(DISTINCT swarm_id) as unique_swarms,
    MIN(timestamp) as first_occurrence,
    MAX(timestamp) as last_occurrence
FROM events
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY type;

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON TABLE swarms IS 'Stores swarm configurations and metadata';
COMMENT ON TABLE agents IS 'Stores agent state and configuration';
COMMENT ON TABLE events IS 'Event log for all system events';
COMMENT ON TABLE sessions IS 'Stores session tree data and state';
COMMENT ON TABLE budgets IS 'Tracks budget allocation and consumption per swarm';

COMMENT ON COLUMN agents.lifecycle_state IS 'Detailed lifecycle state for state machine transitions';
COMMENT ON COLUMN agents.config IS 'JSONB configuration for flexible agent settings';
COMMENT ON COLUMN events.payload IS 'JSONB event data for flexible event structure';
COMMENT ON COLUMN sessions.tree_data IS 'JSONB session tree structure';
