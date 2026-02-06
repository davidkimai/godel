-- Migration: Add Pi Integration Schema
-- Description: Comprehensive schema for Pi provider instances, sessions, worktrees, conversation trees, and agent roles
-- Created: 2026-02-06

-- ============================================
-- 1. Pi Instances Table
-- Provider instance registry for Pi multi-model orchestration
-- ============================================
CREATE TABLE IF NOT EXISTS pi_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    endpoint VARCHAR(500) NOT NULL UNIQUE,
    provider_type VARCHAR(50) NOT NULL,
    region VARCHAR(100),
    zone VARCHAR(100),
    version VARCHAR(50),
    capabilities JSONB NOT NULL DEFAULT '[]',
    health_status VARCHAR(20) NOT NULL DEFAULT 'healthy',
    current_load INTEGER NOT NULL DEFAULT 0,
    max_sessions INTEGER NOT NULL DEFAULT 100,
    cost_per_1k_input DECIMAL(10, 6) NOT NULL DEFAULT 0,
    cost_per_1k_output DECIMAL(10, 6) NOT NULL DEFAULT 0,
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    last_health_check TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT pi_instances_provider_check CHECK (provider_type IN (
        'anthropic', 'openai', 'google', 'groq', 'cerebras', 'ollama', 'kimi', 'minimax'
    )),
    CONSTRAINT pi_instances_health_check CHECK (health_status IN (
        'healthy', 'degraded', 'unhealthy'
    )),
    CONSTRAINT pi_instances_load_check CHECK (current_load >= 0),
    CONSTRAINT pi_instances_max_sessions_check CHECK (max_sessions > 0)
);

-- Pi instances indexes
CREATE INDEX idx_pi_instances_provider ON pi_instances(provider_type);
CREATE INDEX idx_pi_instances_health ON pi_instances(health_status);
CREATE INDEX idx_pi_instances_region ON pi_instances(region);
CREATE INDEX idx_pi_instances_load ON pi_instances(current_load);
CREATE INDEX idx_pi_instances_heartbeat ON pi_instances(last_heartbeat);

-- Partial index for healthy instances (common routing query)
CREATE INDEX idx_pi_instances_healthy ON pi_instances(health_status, current_load, max_sessions)
    WHERE health_status = 'healthy';

-- ============================================
-- 2. Pi Sessions Table
-- Session lifecycle management for Pi provider sessions
-- ============================================
CREATE TABLE IF NOT EXISTS pi_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instance_id UUID NOT NULL REFERENCES pi_instances(id) ON DELETE CASCADE,
    agent_id UUID,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'initializing',
    config JSONB NOT NULL DEFAULT '{}',
    tree_root_id UUID,
    current_node_id UUID,
    checkpoint_data JSONB,
    token_usage INTEGER NOT NULL DEFAULT 0,
    cost_incurred DECIMAL(12, 4) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT pi_sessions_status_check CHECK (status IN (
        'initializing', 'active', 'paused', 'completed', 'failed', 'terminated'
    )),
    CONSTRAINT pi_sessions_token_usage_check CHECK (token_usage >= 0),
    CONSTRAINT pi_sessions_cost_check CHECK (cost_incurred >= 0)
);

-- Pi sessions indexes
CREATE INDEX idx_pi_sessions_instance ON pi_sessions(instance_id);
CREATE INDEX idx_pi_sessions_agent ON pi_sessions(agent_id);
CREATE INDEX idx_pi_sessions_status ON pi_sessions(status);
CREATE INDEX idx_pi_sessions_provider ON pi_sessions(provider, model);
CREATE INDEX idx_pi_sessions_created ON pi_sessions(created_at DESC);
CREATE INDEX idx_pi_sessions_ended ON pi_sessions(ended_at);

-- Composite index for active sessions per instance
CREATE INDEX idx_pi_sessions_instance_status ON pi_sessions(instance_id, status)
    WHERE status IN ('initializing', 'active', 'paused');

-- ============================================
-- 3. Worktrees Table
-- Git worktree isolation for parallel agent execution
-- ============================================
CREATE TABLE IF NOT EXISTS worktrees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES pi_sessions(id) ON DELETE SET NULL,
    repository_path VARCHAR(500) NOT NULL,
    worktree_path VARCHAR(500) NOT NULL,
    git_dir VARCHAR(500),
    base_branch VARCHAR(255) NOT NULL,
    current_branch VARCHAR(255) NOT NULL,
    dependencies_shared JSONB NOT NULL DEFAULT '[]',
    cleanup_policy VARCHAR(20) NOT NULL DEFAULT 'on_completion',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    cleaned_up_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT worktrees_cleanup_check CHECK (cleanup_policy IN (
        'immediate', 'on_completion', 'on_failure', 'manual', 'scheduled'
    )),
    CONSTRAINT worktrees_status_check CHECK (status IN (
        'active', 'stale', 'cleaning', 'cleaned', 'failed'
    ))
);

-- Worktrees indexes
CREATE INDEX idx_worktrees_session ON worktrees(session_id);
CREATE INDEX idx_worktrees_status ON worktrees(status);
CREATE INDEX idx_worktrees_repo ON worktrees(repository_path);
CREATE INDEX idx_worktrees_created ON worktrees(created_at DESC);
CREATE INDEX idx_worktrees_activity ON worktrees(last_activity DESC);
CREATE INDEX idx_worktrees_branch ON worktrees(current_branch);

-- Partial index for active worktrees
CREATE INDEX idx_worktrees_active ON worktrees(session_id, status)
    WHERE status = 'active';

-- ============================================
-- 4. Conversation Trees Table
-- Tree-structured session management for Pi sessions
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_trees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES pi_sessions(id) ON DELETE CASCADE,
    root_node_id UUID,
    current_node_id UUID,
    branches JSONB NOT NULL DEFAULT '[]',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Conversation trees indexes
CREATE INDEX idx_conversation_trees_session ON conversation_trees(session_id);
CREATE INDEX idx_conversation_trees_root ON conversation_trees(root_node_id);
CREATE INDEX idx_conversation_trees_current ON conversation_trees(current_node_id);
CREATE INDEX idx_conversation_trees_created ON conversation_trees(created_at DESC);

-- ============================================
-- 5. Conversation Nodes Table
-- Individual nodes in conversation trees
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tree_id UUID NOT NULL REFERENCES conversation_trees(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    parent_id UUID REFERENCES conversation_nodes(id) ON DELETE SET NULL,
    children_ids JSONB NOT NULL DEFAULT '[]',
    tool_calls JSONB,
    tool_results JSONB,
    token_count INTEGER NOT NULL DEFAULT 0,
    cumulative_tokens INTEGER NOT NULL DEFAULT 0,
    is_compacted BOOLEAN NOT NULL DEFAULT FALSE,
    summary TEXT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT conversation_nodes_role_check CHECK (role IN (
        'user', 'assistant', 'system', 'tool'
    )),
    CONSTRAINT conversation_nodes_token_count_check CHECK (token_count >= 0),
    CONSTRAINT conversation_nodes_cumulative_check CHECK (cumulative_tokens >= 0)
);

-- Conversation nodes indexes
CREATE INDEX idx_conversation_nodes_tree ON conversation_nodes(tree_id);
CREATE INDEX idx_conversation_nodes_parent ON conversation_nodes(parent_id);
CREATE INDEX idx_conversation_nodes_role ON conversation_nodes(role);
CREATE INDEX idx_conversation_nodes_timestamp ON conversation_nodes(timestamp DESC);
CREATE INDEX idx_conversation_nodes_compacted ON conversation_nodes(is_compacted)
    WHERE is_compacted = TRUE;

-- Composite index for tree traversal
CREATE INDEX idx_conversation_nodes_tree_parent ON conversation_nodes(tree_id, parent_id);

-- ============================================
-- 6. Agent Roles Table
-- Role definitions for agent specialization
-- ============================================
CREATE TABLE IF NOT EXISTS agent_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    tools_allowed JSONB NOT NULL DEFAULT '[]',
    permissions JSONB NOT NULL DEFAULT '[]',
    max_iterations INTEGER NOT NULL DEFAULT 10,
    auto_submit BOOLEAN NOT NULL DEFAULT FALSE,
    require_approval BOOLEAN NOT NULL DEFAULT FALSE,
    can_message_roles JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT agent_roles_iterations_check CHECK (max_iterations > 0)
);

-- Agent roles indexes
CREATE INDEX idx_agent_roles_role_id ON agent_roles(role_id);
CREATE INDEX idx_agent_roles_name ON agent_roles(name);
CREATE INDEX idx_agent_roles_created ON agent_roles(created_at DESC);

-- ============================================
-- 7. OpenClaw Instances Table (Federation)
-- Instance registry for OpenClaw federation support
-- ============================================
CREATE TABLE IF NOT EXISTS openclaw_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    endpoint VARCHAR(500) NOT NULL UNIQUE,
    region VARCHAR(100),
    zone VARCHAR(100),
    capabilities JSONB NOT NULL DEFAULT '[]',
    cpu_percent DECIMAL(5, 2),
    memory_percent DECIMAL(5, 2),
    health_status VARCHAR(20) NOT NULL DEFAULT 'healthy',
    current_sessions INTEGER NOT NULL DEFAULT 0,
    max_sessions INTEGER NOT NULL DEFAULT 100,
    routing_weight INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_health_check TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT openclaw_instances_health_check CHECK (health_status IN (
        'healthy', 'degraded', 'unhealthy'
    )),
    CONSTRAINT openclaw_instances_cpu_check CHECK (cpu_percent >= 0 AND cpu_percent <= 100),
    CONSTRAINT openclaw_instances_memory_check CHECK (memory_percent >= 0 AND memory_percent <= 100),
    CONSTRAINT openclaw_instances_sessions_check CHECK (current_sessions >= 0),
    CONSTRAINT openclaw_instances_max_sessions_check CHECK (max_sessions > 0),
    CONSTRAINT openclaw_instances_weight_check CHECK (routing_weight >= 0)
);

-- OpenClaw instances indexes
CREATE INDEX idx_openclaw_instances_health ON openclaw_instances(health_status);
CREATE INDEX idx_openclaw_instances_region ON openclaw_instances(region);
CREATE INDEX idx_openclaw_instances_active ON openclaw_instances(is_active);
CREATE INDEX idx_openclaw_instances_health_check ON openclaw_instances(last_health_check);

-- Partial index for active, healthy instances
CREATE INDEX idx_openclaw_instances_routing ON openclaw_instances(is_active, health_status, routing_weight)
    WHERE is_active = TRUE AND health_status = 'healthy';

-- ============================================
-- 8. Provider Routing Rules Table
-- Routing configuration for provider selection
-- ============================================
CREATE TABLE IF NOT EXISTS provider_routing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    strategy VARCHAR(50) NOT NULL DEFAULT 'cost_optimized',
    fallback_chain JSONB NOT NULL DEFAULT '[]',
    cost_optimization_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    capability_matching_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT provider_routing_strategy_check CHECK (strategy IN (
        'cost_optimized', 'capability_matched', 'fallback_chain', 'round_robin', 'weighted'
    ))
);

-- Provider routing rules indexes
CREATE INDEX idx_provider_routing_name ON provider_routing_rules(name);
CREATE INDEX idx_provider_routing_strategy ON provider_routing_rules(strategy);
CREATE INDEX idx_provider_routing_created ON provider_routing_rules(created_at DESC);

-- ============================================
-- 9. Todos Table
-- Todo tracking for agent task management
-- ============================================
CREATE TABLE IF NOT EXISTS todos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES pi_sessions(id) ON DELETE CASCADE,
    todo_id VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT todos_status_check CHECK (status IN (
        'pending', 'in_progress', 'completed', 'cancelled', 'blocked'
    )),
    CONSTRAINT todos_priority_check CHECK (priority >= 1 AND priority <= 5),
    CONSTRAINT todos_unique_session_id UNIQUE (session_id, todo_id)
);

-- Todos indexes
CREATE INDEX idx_todos_session ON todos(session_id);
CREATE INDEX idx_todos_status ON todos(status);
CREATE INDEX idx_todos_priority ON todos(priority DESC);
CREATE INDEX idx_todos_created ON todos(created_at DESC);
CREATE INDEX idx_todos_completed ON todos(completed_at);

-- Partial index for incomplete todos
CREATE INDEX idx_todos_pending ON todos(session_id, priority DESC, created_at)
    WHERE status IN ('pending', 'in_progress');

-- ============================================
-- Triggers for updated_at
-- ============================================
CREATE TRIGGER update_pi_instances_updated_at
    BEFORE UPDATE ON pi_instances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pi_sessions_updated_at
    BEFORE UPDATE ON pi_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_worktrees_updated_at
    BEFORE UPDATE ON worktrees
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversation_trees_updated_at
    BEFORE UPDATE ON conversation_trees
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_roles_updated_at
    BEFORE UPDATE ON agent_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_openclaw_instances_updated_at
    BEFORE UPDATE ON openclaw_instances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_routing_rules_updated_at
    BEFORE UPDATE ON provider_routing_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_todos_updated_at
    BEFORE UPDATE ON todos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security (RLS) Policies
-- ============================================

-- Enable RLS on all new tables
ALTER TABLE pi_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE pi_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE worktrees ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_trees ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE openclaw_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for service accounts
-- (Applications should create more restrictive policies based on their auth model)
CREATE POLICY pi_instances_all ON pi_instances FOR ALL TO PUBLIC USING (true);
CREATE POLICY pi_sessions_all ON pi_sessions FOR ALL TO PUBLIC USING (true);
CREATE POLICY worktrees_all ON worktrees FOR ALL TO PUBLIC USING (true);
CREATE POLICY conversation_trees_all ON conversation_trees FOR ALL TO PUBLIC USING (true);
CREATE POLICY conversation_nodes_all ON conversation_nodes FOR ALL TO PUBLIC USING (true);
CREATE POLICY agent_roles_all ON agent_roles FOR ALL TO PUBLIC USING (true);
CREATE POLICY openclaw_instances_all ON openclaw_instances FOR ALL TO PUBLIC USING (true);
CREATE POLICY provider_routing_rules_all ON provider_routing_rules FOR ALL TO PUBLIC USING (true);
CREATE POLICY todos_all ON todos FOR ALL TO PUBLIC USING (true);

-- ============================================
-- Views
-- ============================================

-- Pi instance summary view
CREATE OR REPLACE VIEW pi_instance_summary AS
SELECT 
    i.id,
    i.endpoint,
    i.provider_type,
    i.region,
    i.health_status,
    i.current_load,
    i.max_sessions,
    ROUND((i.current_load::DECIMAL / NULLIF(i.max_sessions, 0)) * 100, 2) as load_percentage,
    i.cost_per_1k_input,
    i.cost_per_1k_output,
    i.last_heartbeat,
    COUNT(s.id) FILTER (WHERE s.status IN ('initializing', 'active')) as active_sessions,
    i.created_at
FROM pi_instances i
LEFT JOIN pi_sessions s ON i.id = s.instance_id
GROUP BY i.id, i.endpoint, i.provider_type, i.region, i.health_status, 
         i.current_load, i.max_sessions, i.cost_per_1k_input, i.cost_per_1k_output, 
         i.last_heartbeat, i.created_at;

-- Pi session activity view
CREATE OR REPLACE VIEW pi_session_activity AS
SELECT 
    s.id,
    s.provider,
    s.model,
    s.status,
    i.endpoint as instance_endpoint,
    s.token_usage,
    s.cost_incurred,
    s.created_at,
    s.ended_at,
    EXTRACT(EPOCH FROM (COALESCE(s.ended_at, NOW()) - s.created_at)) as duration_seconds,
    COUNT(t.id) FILTER (WHERE t.status IN ('pending', 'in_progress')) as pending_todos
FROM pi_sessions s
LEFT JOIN pi_instances i ON s.instance_id = i.id
LEFT JOIN todos t ON s.id = t.session_id
GROUP BY s.id, s.provider, s.model, s.status, i.endpoint, 
         s.token_usage, s.cost_incurred, s.created_at, s.ended_at;

-- Worktree status view
CREATE OR REPLACE VIEW worktree_status AS
SELECT 
    w.id,
    w.repository_path,
    w.worktree_path,
    w.base_branch,
    w.current_branch,
    w.status,
    w.cleanup_policy,
    w.created_at,
    w.last_activity,
    w.cleaned_up_at,
    EXTRACT(EPOCH FROM (NOW() - w.last_activity)) as seconds_since_activity,
    CASE 
        WHEN w.status = 'active' AND w.last_activity < NOW() - INTERVAL '1 hour' THEN TRUE
        ELSE FALSE
    END as is_stale
FROM worktrees w;

-- Todo summary view
CREATE OR REPLACE VIEW todo_summary AS
SELECT 
    session_id,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
    COUNT(*) FILTER (WHERE status = 'blocked') as blocked_count,
    COUNT(*) as total_count,
    MIN(created_at) FILTER (WHERE status = 'pending') as oldest_pending,
    MAX(completed_at) as last_completed
FROM todos
GROUP BY session_id;

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON TABLE pi_instances IS 'Pi provider instance registry for multi-model orchestration';
COMMENT ON TABLE pi_sessions IS 'Session lifecycle management for Pi provider sessions';
COMMENT ON TABLE worktrees IS 'Git worktree isolation for parallel agent execution';
COMMENT ON TABLE conversation_trees IS 'Tree-structured session management for conversation history';
COMMENT ON TABLE conversation_nodes IS 'Individual nodes in conversation trees';
COMMENT ON TABLE agent_roles IS 'Role definitions for agent specialization and permissions';
COMMENT ON TABLE openclaw_instances IS 'OpenClaw federation instance registry';
COMMENT ON TABLE provider_routing_rules IS 'Routing configuration for provider selection strategies';
COMMENT ON TABLE todos IS 'Todo tracking for agent task management';

COMMENT ON COLUMN pi_instances.capabilities IS 'JSONB array of provider capabilities (e.g., ["vision", "tools", "thinking"])';
COMMENT ON COLUMN pi_sessions.checkpoint_data IS 'JSONB checkpoint data for session resumption';
COMMENT ON COLUMN worktrees.dependencies_shared IS 'JSONB array of shared dependency paths';
COMMENT ON COLUMN conversation_trees.branches IS 'JSONB array of branch metadata';
COMMENT ON COLUMN conversation_nodes.children_ids IS 'JSONB array of child node UUIDs';
COMMENT ON COLUMN agent_roles.can_message_roles IS 'JSONB array of role_ids this role can message';
COMMENT ON COLUMN provider_routing_rules.fallback_chain IS 'JSONB ordered array of provider IDs for fallback';

-- Down migration
-- DROP TABLE IF EXISTS todos CASCADE;
-- DROP TABLE IF EXISTS provider_routing_rules CASCADE;
-- DROP TABLE IF EXISTS openclaw_instances CASCADE;
-- DROP TABLE IF EXISTS agent_roles CASCADE;
-- DROP TABLE IF EXISTS conversation_nodes CASCADE;
-- DROP TABLE IF EXISTS conversation_trees CASCADE;
-- DROP TABLE IF EXISTS worktrees CASCADE;
-- DROP TABLE IF EXISTS pi_sessions CASCADE;
-- DROP TABLE IF EXISTS pi_instances CASCADE;
