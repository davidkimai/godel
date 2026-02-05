import { AgentSQLiteStorage } from '../src/storage/sqlite-storage';
import { AgentData, SwarmData } from '../src/storage/types';

describe('AgentSQLiteStorage', () => {
  let storage: AgentSQLiteStorage;
  
  beforeEach(async () => {
    storage = new AgentSQLiteStorage(':memory:');
    await storage.initialize();
  });
  
  afterEach(() => {
    (storage as any).db.close();
  });
  
  describe('Core Operations', () => {
    it('should create a record in a table', async () => {
      const id = await storage.create('agents', {
        name: 'test-agent',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        status: 'idle'
      });
      
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBe(36); // UUID format
    });
    
    it('should read a record by id', async () => {
      const createdId = await storage.create('agents', {
        name: 'test-agent',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        status: 'idle'
      });
      
      const record = await storage.read('agents', createdId);
      
      expect(record).not.toBeNull();
      expect(record?.id).toBe(createdId);
      expect(record?.name).toBe('test-agent');
    });
    
    it('should return null when reading non-existent record', async () => {
      const record = await storage.read('agents', 'non-existent-id');
      
      expect(record).toBeNull();
    });
    
    it('should update a record', async () => {
      const createdId = await storage.create('agents', {
        name: 'test-agent',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        status: 'idle'
      });
      
      await storage.update('agents', createdId, { status: 'running' });
      
      const record = await storage.read('agents', createdId);
      
      expect(record?.status).toBe('running');
    });
    
    it('should delete a record', async () => {
      const createdId = await storage.create('agents', {
        name: 'test-agent',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        status: 'idle'
      });
      
      await storage.delete('agents', createdId);
      
      const record = await storage.read('agents', createdId);
      
      expect(record).toBeNull();
    });
    
    it('should list all records in a table', async () => {
      await storage.create('agents', { name: 'agent1', provider: 'anthropic', model: 'claude', status: 'idle' });
      await storage.create('agents', { name: 'agent2', provider: 'openai', model: 'gpt-4', status: 'running' });
      
      const records = await storage.list('agents');
      
      expect(records.length).toBe(2);
    });
  });
  
  describe('Agent Operations', () => {
    it('should create an agent', async () => {
      const agentData: AgentData = {
        id: '',
        name: 'test-agent',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        status: 'idle',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      const id = await storage.createAgent(agentData);
      
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });
    
    it('should get an agent by id', async () => {
      const agentData: AgentData = {
        id: '',
        name: 'test-agent',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        status: 'idle',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      const createdId = await storage.createAgent(agentData);
      const agent = await storage.getAgent(createdId);
      
      expect(agent).not.toBeNull();
      expect(agent?.id).toBe(createdId);
      expect(agent?.name).toBe('test-agent');
      expect(agent?.provider).toBe('anthropic');
      expect(agent?.model).toBe('claude-3-5-sonnet-20241022');
      expect(agent?.status).toBe('idle');
    });
    
    it('should list all agents', async () => {
      await storage.createAgent({ id: '', name: 'agent1', provider: 'anthropic', model: 'claude', status: 'idle', createdAt: Date.now(), updatedAt: Date.now() });
      await storage.createAgent({ id: '', name: 'agent2', provider: 'openai', model: 'gpt-4', status: 'running', createdAt: Date.now(), updatedAt: Date.now() });
      
      const agents = await storage.listAgents();
      
      expect(agents.length).toBe(2);
    });
    
    it('should update an agent', async () => {
      const createdId = await storage.createAgent({ id: '', name: 'test-agent', provider: 'anthropic', model: 'claude', status: 'idle', createdAt: Date.now(), updatedAt: Date.now() });
      
      await storage.updateAgent(createdId, { status: 'running' });
      
      const agent = await storage.getAgent(createdId);
      
      expect(agent?.status).toBe('running');
    });
    
    it('should delete an agent', async () => {
      const createdId = await storage.createAgent({ id: '', name: 'test-agent', provider: 'anthropic', model: 'claude', status: 'idle', createdAt: Date.now(), updatedAt: Date.now() });
      
      await storage.deleteAgent(createdId);
      
      const agent = await storage.getAgent(createdId);
      
      expect(agent).toBeNull();
    });
    
    it('should handle agent metadata', async () => {
      const agentData: AgentData = {
        id: '',
        name: 'test-agent',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        status: 'idle',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: { tags: ['test', 'demo'], config: { temperature: 0.7 } }
      };
      
      const createdId = await storage.createAgent(agentData);
      const agent = await storage.getAgent(createdId);
      
      expect(agent?.metadata).toBeDefined();
      expect(agent?.metadata?.tags).toEqual(['test', 'demo']);
      expect(agent?.metadata?.config).toEqual({ temperature: 0.7 });
    });
  });
  
  describe('Swarm Operations', () => {
    it('should create a swarm', async () => {
      const swarmData: SwarmData = {
        id: '',
        name: 'test-swarm',
        agentIds: ['agent-1', 'agent-2'],
        task: 'Test task',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      const id = await storage.createSwarm(swarmData);
      
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });
    
    it('should get a swarm by id', async () => {
      const swarmData: SwarmData = {
        id: '',
        name: 'test-swarm',
        agentIds: ['agent-1', 'agent-2'],
        task: 'Test task',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      const createdId = await storage.createSwarm(swarmData);
      const swarm = await storage.getSwarm(createdId);
      
      expect(swarm).not.toBeNull();
      expect(swarm?.id).toBe(createdId);
      expect(swarm?.name).toBe('test-swarm');
      expect(swarm?.agentIds).toEqual(['agent-1', 'agent-2']);
      expect(swarm?.task).toBe('Test task');
      expect(swarm?.status).toBe('pending');
    });
    
    it('should list all swarms', async () => {
      await storage.createSwarm({ id: '', name: 'swarm1', agentIds: ['a1'], task: 'task1', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() });
      await storage.createSwarm({ id: '', name: 'swarm2', agentIds: ['a2'], task: 'task2', status: 'running', createdAt: Date.now(), updatedAt: Date.now() });
      
      const swarms = await storage.listSwarms();
      
      expect(swarms.length).toBe(2);
    });
    
    it('should update a swarm', async () => {
      const createdId = await storage.createSwarm({ id: '', name: 'test-swarm', agentIds: ['a1'], task: 'task', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() });
      
      await storage.updateSwarm(createdId, { status: 'running' });
      
      const swarm = await storage.getSwarm(createdId);
      
      expect(swarm?.status).toBe('running');
    });
    
    it('should delete a swarm', async () => {
      const createdId = await storage.createSwarm({ id: '', name: 'test-swarm', agentIds: ['a1'], task: 'task', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() });
      
      await storage.deleteSwarm(createdId);
      
      const swarm = await storage.getSwarm(createdId);
      
      expect(swarm).toBeNull();
    });
  });
  
  describe('Initialization', () => {
    it('should initialize only once', async () => {
      const storage = new AgentSQLiteStorage(':memory:');
      
      await storage.initialize();
      await storage.initialize();
      await storage.initialize();
      
      // Should not throw and should work correctly
      const id = await storage.createAgent({ id: '', name: 'test', provider: 'anthropic', model: 'claude', status: 'idle', createdAt: Date.now(), updatedAt: Date.now() });
      
      expect(id).toBeDefined();
      
      (storage as any).db.close();
    });
  });
});
