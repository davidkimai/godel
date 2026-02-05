-- PostgreSQL Database Schema for Dash
-- SPEC-T2: PostgreSQL Integration
-- Database: dash
-- User: dash

-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Swarms Table (must be created before agents due to FK)
-- ============================================================================
CREATE TABLE IF NOT EXISTS swarms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    config JSONB DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'creating',
    budget_allocated DECIMAL(12, 4),
    budget_consumed DECIMAL(12, 4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================================
-- Agents Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    swarm_id UUID,
    label VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    lifecycle_state VARCHAR(50) NOT NULL DEFAULT 'initializing',
    model VARCHAR(255) NOT NULL,
    task TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    context JSONB,
    code JSONB,
    reasoning JSONB,
    safety_boundaries JSONB,
    spawned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    pause_time TIMESTAMP WITH TIME ZONE,
    paused_by VARCHAR(255),
    runtime INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_error TEXT,
    budget_limit DECIMAL(12, 4),
    metadata JSONB DEFAULT '{}',
    CONSTRAINT fk_swarm FOREIGN KEY (swarm_id) REFERENCES swarms(id) ON DELETE SET NULL
);

-- ============================================================================
-- Events Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    event_type VARCHAR(100) NOT NULL,
    source JSONB,
    payload JSONB,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    swarm_id UUID REFERENCES swarms(id) ON DELETE CASCADE
);

-- ============================================================================
-- Sessions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    context JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- Budgets Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    total_budget DECIMAL(12, 4) NOT NULL,
    used_budget DECIMAL(12, 4) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'USD',
    period_start TIMESTAMP WITH TIME ZONE,
    period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_entity_budget UNIQUE (entity_type, entity_id)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Agent indexes
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_lifecycle_state ON agents(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_agents_swarm_id ON agents(swarm_id);
CREATE INDEX IF NOT EXISTS idx_agents_model ON agents(model);
CREATE INDEX IF NOT EXISTS idx_agents_spawned_at ON agents(spawned_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_status_spawned ON agents(status, spawned_at DESC);

-- Swarm indexes
CREATE INDEX IF NOT EXISTS idx_swarms_status ON swarms(status);
CREATE INDEX IF NOT EXISTS idx_swarms_created_at ON swarms(created_at DESC);

-- Event indexes
CREATE INDEX IF NOT EXISTS idx_events_agent_id ON events(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_swarm_id ON events(swarm_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);

-- Session indexes
CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_parent_id ON sessions(parent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Budget indexes
CREATE INDEX IF NOT EXISTS idx_budgets_entity ON budgets(entity_type, entity_id);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE agents IS 'Agents managed by Dash orchestration';
COMMENT ON TABLE swarms IS 'Swarm configurations and state';
COMMENT ON TABLE events IS 'Event log for agents and swarms';
COMMENT ON TABLE sessions IS 'Agent session tree for hierarchical context';
COMMENT ON TABLE budgets IS 'Budget tracking per entity';
