/**
 * Example HTTP Server with Observability
 * 
 * Demonstrates how to integrate the observability module with an Express server.
 * This is a reference implementation showing:
 * - Health check endpoints
 * - Metrics endpoint
 * - Tracing integration
 * - Request logging
 */

import express from 'express';
import {
  createHealthRouter,
  getGlobalMetricsCollector,
  initializeObservability,
  withSpan,
} from './index';

// Initialize observability
initializeObservability({
  serviceName: 'godel-example-server',
  version: '2.0.0',
  environment: 'development',
  samplingRatio: 0.1,
});

const app = express();
const metrics = getGlobalMetricsCollector();

// JSON parsing middleware
app.use(express.json());

// Request timing middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.recordHttpRequest(req.method, req.route?.path || req.path, res.statusCode, duration);
  });
  next();
});

// Health check endpoints
app.use(createHealthRouter({ 
  version: '2.0.0',
  serviceName: 'godel-example-server',
}));

// Metrics endpoint (Prometheus format)
app.get('/metrics', async (req, res) => {
  const metricsData = await metrics.getMetrics();
  res.set('Content-Type', metrics.getContentType());
  res.send(metricsData);
});

// Example API endpoint with tracing
app.get('/api/teams', async (req, res) => {
  await withSpan('list-teams', async (span) => {
    span.setAttribute('http.method', req.method);
    span.setAttribute('http.route', '/api/teams');
    
    // Simulate team listing
    const teams = [
      { id: 'team-1', name: 'Alpha Squad', status: 'active' },
      { id: 'team-2', name: 'Beta Squad', status: 'idle' },
    ];
    
    span.setAttribute('teams.count', teams.length);
    res.json({ teams });
  });
});

// Example API endpoint with agent metrics
app.post('/api/teams/:teamId/agents', async (req, res) => {
  const { teamId } = req.params;
  
  await withSpan('create-agent', async (span) => {
    span.setAttribute('team.id', teamId);
    span.setAttribute('agent.model', req.body.model || 'default');
    
    // Simulate agent creation
    const agentId = `agent-${Date.now()}`;
    
    // Update metrics
    metrics.setAgentCounts(teamId, {
      active: 1,
      pending: 0,
      failed: 0,
      completed: 0,
    });
    
    metrics.recordAgentExecution(teamId, 'success', 150, req.body.model);
    
    res.status(201).json({ 
      id: agentId,
      teamId,
      status: 'active',
    });
  });
});

// Example endpoint with error tracking
app.get('/api/error-example', async (req, res) => {
  try {
    await withSpan('error-example', async () => {
      throw new Error('Simulated error for testing');
    });
  } catch (error) {
    metrics.recordError('simulated_error', 'api', 'error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const PORT = process.env['PORT'] || 3000;
app.listen(PORT, () => {
  console.log(`Example server running on port ${PORT}`);
  console.log(`Health checks: http://localhost:${PORT}/health`);
  console.log(`Readiness: http://localhost:${PORT}/health/ready`);
  console.log(`Liveness: http://localhost:${PORT}/health/live`);
  console.log(`Metrics: http://localhost:${PORT}/metrics`);
});

export default app;
