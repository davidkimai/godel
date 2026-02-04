-- Migration: Add scheduling history table
-- Description: Store scheduling decisions for analysis and audit

CREATE TABLE IF NOT EXISTS scheduling_history (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(255) NOT NULL,
    swarm_id VARCHAR(255),
    node_id VARCHAR(255),
    success BOOLEAN NOT NULL,
    error_message TEXT,
    cpu_requested DECIMAL(10, 2),
    memory_requested INTEGER,
    gpu_memory_requested INTEGER,
    scheduled_at TIMESTAMP NOT NULL DEFAULT NOW(),
    affinity_score DECIMAL(5, 2),
    preempted_agent_ids TEXT[],
    scheduling_latency_ms INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_scheduling_history_agent_id ON scheduling_history(agent_id);
CREATE INDEX idx_scheduling_history_swarm_id ON scheduling_history(swarm_id);
CREATE INDEX idx_scheduling_history_node_id ON scheduling_history(node_id);
CREATE INDEX idx_scheduling_history_scheduled_at ON scheduling_history(scheduled_at);
CREATE INDEX idx_scheduling_history_success ON scheduling_history(success);

-- View for scheduling statistics
CREATE OR REPLACE VIEW scheduling_stats AS
SELECT 
    DATE_TRUNC('hour', scheduled_at) as hour,
    COUNT(*) as total_attempts,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
    SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed,
    AVG(scheduling_latency_ms) as avg_latency_ms,
    AVG(affinity_score) as avg_affinity_score
FROM scheduling_history
GROUP BY DATE_TRUNC('hour', scheduled_at)
ORDER BY hour DESC;

-- Comment on table
COMMENT ON TABLE scheduling_history IS 'History of all scheduling decisions made by the advanced scheduler';
