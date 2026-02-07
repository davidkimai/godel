/**
 * API Routes - SPEC-T2: PostgreSQL Integration
 * 
 * RESTful API endpoints for agents and teams.
 * Uses hybrid storage (SQLite for dev, PostgreSQL for production).
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createStorageFromEnv, isPostgres, getStorageType } from '../../storage/hybrid-factory';
import { PostgresStorage } from '../../storage/postgres-storage';
import { AgentStatus } from '../../models/agent';
import { SQLiteStorage } from '../../storage/sqlite';

let storageInstance: SQLiteStorage | PostgresStorage | null = null;
let storagePromise: Promise<SQLiteStorage | PostgresStorage> | null = null;

/**
 * Get or create storage instance (lazy initialization)
 */
async function getStorage(): Promise<SQLiteStorage | PostgresStorage> {
  if (storageInstance) {
    return storageInstance;
  }
  
  if (storagePromise) {
    return storagePromise;
  }
  
  storagePromise = createStorageFromEnv().then(s => {
    storageInstance = s;
    return s;
  });
  
  return storagePromise;
}

/**
 * Get storage instance or throw error
 */
function getStorageOrFail(): SQLiteStorage | PostgresStorage {
  if (!storageInstance) {
    throw new Error('Database not initialized. Call initialize() first.');
  }
  return storageInstance;
}

export async function storageRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // GET /api/health - Health check with database status
  // ============================================================================
  fastify.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const s = await getStorage();
      
      // Check PostgreSQL health if applicable
      let dbHealthy = true;
      let storageType = 'sqlite';
      
      if (s instanceof PostgresStorage) {
        storageType = 'postgres';
        dbHealthy = await s.healthCheck();
      }
      
      if (!dbHealthy) {
        return reply.status(503).send({
          status: 'unhealthy',
          storage: storageType,
          database: 'unhealthy'
        });
      }
      
      return reply.send({
        status: 'healthy',
        storage: storageType,
        database: 'healthy',
        version: '2.0.0'
      });
    } catch (error) {
      return reply.status(503).send({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // GET /api/storage/status - Storage configuration status
  // ============================================================================
  fastify.get('/storage/status', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const storageType = getStorageType();
      const isPg = isPostgres();
      
      return reply.send({
        type: storageType,
        isPostgres: isPg,
        initialized: storageInstance !== null
      });
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // GET /api/agents - List all agents
  // ============================================================================
  fastify.get('/agents', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const s = await getStorage();
      
      if (s instanceof PostgresStorage) {
        const agents = await s.listAgents();
        return reply.send(agents);
      } else {
        // SQLite storage has different interface
        const agents = (s as SQLiteStorage).getAgentListLightweight?.(100) || [];
        return reply.send(agents);
      }
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to list agents');
      return reply.status(500).send({
        error: 'Failed to list agents',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // POST /api/agents - Create a new agent
  // ============================================================================
  fastify.post('/agents', async (request: FastifyRequest<{
    Body: {
      name: string;
      provider: string;
      model: string;
      metadata?: Record<string, unknown>;
    }
  }>, reply: FastifyReply) => {
    try {
      const { name, provider, model, metadata } = request.body;
      
      if (!name || !provider || !model) {
        return reply.status(400).send({
          error: 'Missing required fields: name, provider, model'
        });
      }
      
      const s = await getStorage();
      
      if (s instanceof PostgresStorage) {
        const id = await s.createAgent({
          id: '',
          name,
          provider,
          model,
          status: 'pending',
          metadata,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        return reply.status(201).send({ id });
      } else {
        // SQLite storage
        const sqliteStorage = s as SQLiteStorage;
        const { v4: uuidv4 } = await import('uuid');
        const id = uuidv4();
        
        sqliteStorage.createAgent({
          id,
          label: name,
          model,
          task: '',
          status: AgentStatus.PENDING,
          lifecycleState: 'initializing',
          spawnedAt: new Date(),
          runtime: 0,
          retryCount: 0,
          maxRetries: 3,
          context: { inputContext: [], outputContext: [], sharedContext: [], contextSize: 0, contextWindow: 100000, contextUsage: 0 },
          reasoning: { traces: [], decisions: [], confidence: 1.0 },
          metadata: metadata || {},
          childIds: []
        });
        
        return reply.status(201).send({ id });
      }
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to create agent');
      return reply.status(500).send({
        error: 'Failed to create agent',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // GET /api/agents/:id - Get a specific agent
  // ============================================================================
  fastify.get('/agents/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const s = await getStorage();
      
      let agent;
      if (s instanceof PostgresStorage) {
        agent = await s.getAgent(id);
      } else {
        const sqliteStorage = s as SQLiteStorage;
        agent = sqliteStorage.getAgent(id) || null;
      }
      
      if (!agent) {
        return reply.status(404).send({ error: 'Agent not found' });
      }
      
      return reply.send(agent);
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to get agent');
      return reply.status(500).send({
        error: 'Failed to get agent',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // DELETE /api/agents/:id - Delete an agent
  // ============================================================================
  fastify.delete('/agents/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const s = await getStorage();
      
      if (s instanceof PostgresStorage) {
        await s.deleteAgent(id);
      } else {
        const sqliteStorage = s as SQLiteStorage;
        sqliteStorage.deleteAgent(id);
      }
      
      return reply.status(204).send();
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to delete agent');
      return reply.status(500).send({
        error: 'Failed to delete agent',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // GET /api/teams - List all teams
  // ============================================================================
  fastify.get('/teams', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const s = await getStorage();
      
      if (s instanceof PostgresStorage) {
        const teams = await s.listTeams();
        return reply.send(teams);
      } else {
        const sqliteStorage = s as SQLiteStorage;
        const teams = sqliteStorage.getAllTeams?.() || [];
        return reply.send(teams);
      }
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to list teams');
      return reply.status(500).send({
        error: 'Failed to list teams',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // POST /api/teams - Create a new team
  // ============================================================================
  fastify.post('/teams', async (request: FastifyRequest<{
    Body: {
      name: string;
      task: string;
      agentIds: string[];
      metadata?: Record<string, unknown>;
    }
  }>, reply: FastifyReply) => {
    try {
      const { name, task, agentIds, metadata } = request.body;
      
      if (!name || !task || !agentIds) {
        return reply.status(400).send({
          error: 'Missing required fields: name, task, agentIds'
        });
      }
      
      const s = await getStorage();
      
      if (s instanceof PostgresStorage) {
        const id = await s.createTeam({
          id: '',
          name,
          task,
          agentIds,
          status: 'creating',
          metadata,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        return reply.status(201).send({ id });
      } else {
        // SQLite storage
        const sqliteStorage = s as SQLiteStorage;
        const { v4: uuidv4 } = await import('uuid');
        const id = uuidv4();
        
        sqliteStorage.createTeam({
          id,
          name,
          status: 'creating',
          config: { task, ...metadata },
          agents: agentIds,
          createdAt: new Date(),
          budget: { allocated: 0, consumed: 0, remaining: 0 },
          metrics: {}
        });
        
        return reply.status(201).send({ id });
      }
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to create team');
      return reply.status(500).send({
        error: 'Failed to create team',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // GET /api/teams/:id - Get a specific team
  // ============================================================================
  fastify.get('/teams/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const s = await getStorage();
      
      let team;
      if (s instanceof PostgresStorage) {
        team = await s.getTeam(id);
      } else {
        const sqliteStorage = s as SQLiteStorage;
        team = sqliteStorage.getTeam(id) || null;
      }
      
      if (!team) {
        return reply.status(404).send({ error: 'Team not found' });
      }
      
      return reply.send(team);
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to get team');
      return reply.status(500).send({
        error: 'Failed to get team',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ============================================================================
  // DELETE /api/teams/:id - Delete a team
  // ============================================================================
  fastify.delete('/teams/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const s = await getStorage();
      
      if (s instanceof PostgresStorage) {
        await s.deleteTeam(id);
      } else {
        const sqliteStorage = s as SQLiteStorage;
        sqliteStorage.deleteTeam(id);
      }
      
      return reply.status(204).send();
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to delete team');
      return reply.status(500).send({
        error: 'Failed to delete team',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

export default storageRoutes;
